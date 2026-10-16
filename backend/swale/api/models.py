"""Response models: the machine-checked version of docs/api/v1.md. Extra fields are allowed (v1 is additive)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

KnowledgeTypeLit = Literal["observed", "reported", "predicted", "inferred"]


class Model(BaseModel):
    model_config = ConfigDict(extra="allow")


class SourceRef(Model):
    id: str
    dataset: str | None = None
    record_id: str
    url: str
    updated_at: str | None = None


class SourceFreshness(Model):
    id: str
    dataset_updated_at: str | None
    last_ingested_at: str | None
    fetched_at: str | None = None
    stale: bool


class Geometry(Model):
    type: str
    coordinates: Any


class StatePlane(Model):
    x_ft: float
    y_ft: float
    crs: Literal["EPSG:2263"]


class CatchBasinProps(Model):
    layer: Literal["catch_basins"]
    knowledge_type: Literal["observed"]
    unitid: str
    area_ids: list[str]
    state_plane: StatePlane | None
    source: SourceRef
    ingested_at: str


class VerificationModel(Model):
    status: str
    knowledge_type: Literal["observed", "reported"]
    basis: str | None
    rule: str | None
    text: str | None
    at: str | None


class LinkedBasin(Model):
    id: str
    distance_ft: float
    method: str
    knowledge_type: Literal["inferred"]


class IncidentProps(Model):
    layer: Literal["incidents"]
    knowledge_type: Literal["reported"]
    category: str
    category_label: str
    reported_at: str
    closed_at: str | None
    source_status: str | None
    address: str | None
    verification: VerificationModel
    linked_basin: LinkedBasin | None
    source: SourceRef
    ingested_at: str


class CatchBasinFeature(Model):
    type: Literal["Feature"]
    id: str
    geometry: Geometry | None
    properties: CatchBasinProps


class IncidentFeature(Model):
    type: Literal["Feature"]
    id: str
    geometry: Geometry | None
    properties: IncidentProps


class Meta(Model):
    api_version: Literal["1.0"]
    layer: str
    request_bbox: list[float]
    filters: dict[str, Any]
    count: int
    limit: int
    truncated: bool
    next_cursor: str | None
    generated_at: str
    sources: list[SourceFreshness]


class CatchBasinCollection(Model):
    type: Literal["FeatureCollection"]
    features: list[CatchBasinFeature]
    meta: Meta


class IncidentCollection(Model):
    type: Literal["FeatureCollection"]
    features: list[IncidentFeature]
    meta: Meta


class LayerInfo(Model):
    id: str
    title: str
    knowledge_type: KnowledgeTypeLit
    geometry_type: str
    endpoint: str
    available: bool
    milestone: str
    filters: list[str]
    categories: list[dict[str, str]] | None = None
    attribution: str


class LayersResponse(Model):
    api_version: Literal["1.0"]
    layers: list[LayerInfo]


class SourceInfo(SourceFreshness):
    name: str
    publisher: str
    dataset: str
    url: str
    cadence: str
    time_semantics: str
    known_limitations: list[str]


class SourcesResponse(Model):
    api_version: Literal["1.0"]
    sources: list[SourceInfo]


class HealthResponse(Model):
    status: Literal["ok", "degraded"]
    api_version: Literal["1.0"]
    build: str
    db: dict[str, str]
    sources: list[SourceFreshness]


class LayerProps(Model):
    layer: str
    knowledge_type: KnowledgeTypeLit
    source: SourceRef | None = None  # model outputs (predicted/inferred) have no source record
    ingested_at: str | None = None


class LayerFeature(Model):
    type: Literal["Feature"]
    id: str
    geometry: Geometry | None
    properties: LayerProps


class LayerCollection(Model):
    type: Literal["FeatureCollection"]
    features: list[LayerFeature]
    meta: Meta
