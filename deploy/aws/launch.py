"""Launch Swale on AWS: one EC2 instance (nginx + FastAPI + embedded SurrealDB) behind a CloudFront HTTPS URL.

Run from backend/:  uv run python ../deploy/aws/launch.py [launch|secrets|update|status|teardown]
Credentials come from backend/.env (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN, AWS_DEFAULT_REGION).
The app's own keys are sent to the instance with SSM after boot; they are never put in user data.
"""

from __future__ import annotations

import base64
import json
import os
import sys
import time
from pathlib import Path

import boto3

HERE = Path(__file__).resolve().parent
ENV = HERE.parents[1] / "backend" / ".env"
STATE = HERE.parents[1] / "backend" / "var" / "aws-deploy.json"  # backend/var is gitignored
NAME = "swale-demo"
ROLE = "swale-demo-ec2"
INSTANCE_TYPE = "t3.medium"
APP_KEYS = ("DAYTONA_API_KEY", "AWS_BEARER_TOKEN_BEDROCK", "ARIZE_SPACE_ID", "ARIZE_API_KEY",
            "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "SWALE_SOCRATA_APP_TOKEN")
CACHING_DISABLED = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"  # AWS managed cache policy
ALL_VIEWER_EXCEPT_HOST = "b689b0a8-53d0-40ab-baf2-68738e2966ac"  # AWS managed origin request policy


def env() -> dict[str, str]:
    out = {}
    for line in ENV.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k] = v.strip().strip('"').strip("'")
    return out


def session(e: dict[str, str]) -> boto3.Session:
    return boto3.Session(aws_access_key_id=e["AWS_ACCESS_KEY_ID"], aws_secret_access_key=e["AWS_SECRET_ACCESS_KEY"],
                         aws_session_token=e.get("AWS_SESSION_TOKEN"), region_name=e.get("AWS_DEFAULT_REGION", "us-west-2"))


def load_state() -> dict:
    return json.loads(STATE.read_text()) if STATE.exists() else {}


def save_state(state: dict) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, indent=2))


def user_data() -> str:
    files = {name: (HERE / name).read_text() for name in ("swale.service", "nginx.conf")}
    parts = ["#!/bin/bash", "mkdir -p /tmp/swale-deploy"]
    for name, body in files.items():
        parts.append(f"cat > /tmp/swale-deploy/{name} <<'SWALE_EOF'\n{body}\nSWALE_EOF")
    parts.append("cat > /tmp/swale-deploy/bootstrap.sh <<'SWALE_EOF'\n" + (HERE / "bootstrap.sh").read_text() + "\nSWALE_EOF")
    parts.append("SWALE_DEPLOY_DIR=/tmp/swale-deploy bash /tmp/swale-deploy/bootstrap.sh")
    return "\n".join(parts) + "\n"


def ensure_role(iam) -> str:
    trust = {"Version": "2012-10-17", "Statement": [{"Effect": "Allow", "Principal": {"Service": "ec2.amazonaws.com"}, "Action": "sts:AssumeRole"}]}
    try:
        iam.create_role(RoleName=ROLE, AssumeRolePolicyDocument=json.dumps(trust), Description="Swale demo instance: SSM access only")
        iam.attach_role_policy(RoleName=ROLE, PolicyArn="arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore")
    except iam.exceptions.EntityAlreadyExistsException:
        pass
    try:
        iam.create_instance_profile(InstanceProfileName=ROLE)
        iam.add_role_to_instance_profile(InstanceProfileName=ROLE, RoleName=ROLE)
        time.sleep(12)  # instance profiles take a few seconds to become usable
    except iam.exceptions.EntityAlreadyExistsException:
        pass
    return ROLE


def ensure_security_group(ec2) -> str:
    vpc = ec2.describe_vpcs(Filters=[{"Name": "isDefault", "Values": ["true"]}])["Vpcs"][0]["VpcId"]
    found = ec2.describe_security_groups(Filters=[{"Name": "group-name", "Values": [NAME]}, {"Name": "vpc-id", "Values": [vpc]}])["SecurityGroups"]
    if found:
        return found[0]["GroupId"]
    sg = ec2.create_security_group(GroupName=NAME, Description="Swale demo: HTTP from CloudFront only", VpcId=vpc)["GroupId"]
    pl = ec2.describe_managed_prefix_lists(Filters=[{"Name": "prefix-list-name", "Values": ["com.amazonaws.global.cloudfront.origin-facing"]}])["PrefixLists"]
    rule = {"IpProtocol": "tcp", "FromPort": 80, "ToPort": 80}
    rule.update({"PrefixListIds": [{"PrefixListId": pl[0]["PrefixListId"], "Description": "CloudFront"}]} if pl
                else {"IpRanges": [{"CidrIp": "0.0.0.0/0"}]})
    ec2.authorize_security_group_ingress(GroupId=sg, IpPermissions=[rule])
    return sg


def launch() -> None:
    e = env()
    s = session(e)
    ec2, iam, cf = s.client("ec2"), s.client("iam"), s.client("cloudfront")
    state = load_state()
    profile = ensure_role(iam)
    sg = ensure_security_group(ec2)
    ami = s.client("ssm").get_parameter(Name="/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64")["Parameter"]["Value"]
    for attempt in range(5):
        try:
            inst = ec2.run_instances(
                ImageId=ami, InstanceType=INSTANCE_TYPE, MinCount=1, MaxCount=1, SecurityGroupIds=[sg],
                IamInstanceProfile={"Name": profile}, UserData=user_data(),
                MetadataOptions={"HttpTokens": "required"},
                BlockDeviceMappings=[{"DeviceName": "/dev/xvda", "Ebs": {"VolumeSize": 30, "VolumeType": "gp3"}}],
                TagSpecifications=[{"ResourceType": "instance", "Tags": [{"Key": "Name", "Value": NAME}]}],
            )["Instances"][0]
            break
        except ec2.exceptions.ClientError as exc:
            if "Invalid IAM Instance Profile" in str(exc) and attempt < 4:
                time.sleep(10)
                continue
            raise
    iid = inst["InstanceId"]
    state.update({"instance_id": iid, "security_group": sg, "region": s.region_name})
    save_state(state)
    print("instance", iid, "starting…")
    ec2.get_waiter("instance_running").wait(InstanceIds=[iid])
    dns = ec2.describe_instances(InstanceIds=[iid])["Reservations"][0]["Instances"][0]["PublicDnsName"]
    state["origin"] = dns
    dist = cf.create_distribution(DistributionConfig={
        "CallerReference": f"{NAME}-{int(time.time())}", "Comment": "Swale demo", "Enabled": True, "PriceClass": "PriceClass_100",
        "Origins": {"Quantity": 1, "Items": [{"Id": "ec2", "DomainName": dns, "CustomOriginConfig": {
            "HTTPPort": 80, "HTTPSPort": 443, "OriginProtocolPolicy": "http-only", "OriginReadTimeout": 60, "OriginKeepaliveTimeout": 5}}]},
        "DefaultCacheBehavior": {"TargetOriginId": "ec2", "ViewerProtocolPolicy": "redirect-to-https", "Compress": True,
                                 "CachePolicyId": CACHING_DISABLED, "OriginRequestPolicyId": ALL_VIEWER_EXCEPT_HOST,
                                 "AllowedMethods": {"Quantity": 7, "Items": ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
                                                    "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]}}},
    })["Distribution"]
    state.update({"distribution_id": dist["Id"], "url": f"https://{dist['DomainName']}"})
    save_state(state)
    print(json.dumps({k: state[k] for k in ("instance_id", "url")}, indent=2))


def ssm_run(s: boto3.Session, iid: str, commands: list[str], comment: str) -> dict:
    ssm = s.client("ssm")
    cid = ssm.send_command(InstanceIds=[iid], DocumentName="AWS-RunShellScript", Comment=comment,
                           Parameters={"commands": commands})["Command"]["CommandId"]
    for _ in range(60):
        time.sleep(3)
        try:
            r = ssm.get_command_invocation(CommandId=cid, InstanceId=iid)
        except ssm.exceptions.InvocationDoesNotExist:
            continue
        if r["Status"] not in ("Pending", "InProgress", "Delayed"):
            return r
    return r


def secrets() -> None:
    """Write the app's keys to /opt/swale/backend/.env on the instance and restart the API."""
    e = env()
    s = session(e)
    iid = load_state()["instance_id"]
    body = "\n".join([f"{k}={e[k]}" for k in APP_KEYS if e.get(k)] + ["AWS_REGION=us-east-1", "SWALE_DEV_MAP=1", "SWALE_ALERT_MONITOR=1"])
    b64 = base64.b64encode(body.encode()).decode()
    r = ssm_run(s, iid, [f"echo {b64} | base64 -d > /opt/swale/backend/.env", "chown swale:swale /opt/swale/backend/.env",
                         "chmod 600 /opt/swale/backend/.env", "systemctl restart swale", "sleep 4", "systemctl is-active swale"],
                "swale: write app keys")
    print("secrets:", r["Status"], r.get("StandardOutputContent", "").strip()[-200:], r.get("StandardErrorContent", "").strip()[-300:])


def update() -> None:
    """Pull the latest main onto the running instance, rebuild, refresh nginx and restart the API (data is kept)."""
    e = env()
    s = session(e)
    iid = load_state()["instance_id"]
    r = ssm_run(s, iid, [
        "set -e",
        "cd /opt/swale && sudo -u swale git fetch --depth 1 origin main && sudo -u swale git reset --hard origin/main",
        "sudo -u swale bash -lc 'cd /opt/swale/frontend && npm ci --no-audit --no-fund && npm run build' > /tmp/swale-update.log 2>&1",
        "sudo -u swale bash -lc 'cd /opt/swale/backend && uv sync --frozen' >> /tmp/swale-update.log 2>&1",
        "cp /opt/swale/deploy/aws/nginx.conf /etc/nginx/conf.d/swale.conf && nginx -t && systemctl reload nginx",
        "sudo -u swale git -C /opt/swale log -1 --format='deployed %h %s'",
    ], "swale: update")
    print("update:", r["Status"], r.get("StandardOutputContent", "").strip()[-400:], r.get("StandardErrorContent", "").strip()[-600:])
    secrets()


def status() -> None:
    e = env()
    s = session(e)
    st = load_state()
    r = ssm_run(s, st["instance_id"], ["tail -n 5 /var/log/swale-bootstrap.log || true", "systemctl is-active swale nginx || true",
                                        "curl -s -o /dev/null -w 'api %{http_code}\\n' http://127.0.0.1/api/v1/health || true"], "swale: status")
    print(r["Status"], "\n" + r.get("StandardOutputContent", "")[-1500:], r.get("StandardErrorContent", "")[-500:])
    dist = s.client("cloudfront").get_distribution(Id=st["distribution_id"])["Distribution"]
    print("cloudfront:", dist["Status"], st["url"])


def teardown() -> None:
    e = env()
    s = session(e)
    st = load_state()
    cf = s.client("cloudfront")
    d = cf.get_distribution_config(Id=st["distribution_id"])
    if d["DistributionConfig"]["Enabled"]:
        d["DistributionConfig"]["Enabled"] = False
        cf.update_distribution(Id=st["distribution_id"], IfMatch=d["ETag"], DistributionConfig=d["DistributionConfig"])
        print("CloudFront disabled; delete it from the console once it shows Deployed (about 10 minutes).")
    s.client("ec2").terminate_instances(InstanceIds=[st["instance_id"]])
    print("instance terminating:", st["instance_id"])


if __name__ == "__main__":
    {"launch": launch, "secrets": secrets, "update": update, "status": status, "teardown": teardown}[sys.argv[1] if len(sys.argv) > 1 else "launch"]()
