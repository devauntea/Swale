-- Swale schema, Milestone 1. SurrealQL 2.x (embedded engine surrealdb-core 2.3.10).
-- Every statement is idempotent (OVERWRITE keeps data), so apply_schema() runs at every start.

DEFINE TABLE OVERWRITE data_source SCHEMAFULL;
DEFINE FIELD OVERWRITE name               ON data_source TYPE string;
DEFINE FIELD OVERWRITE publisher          ON data_source TYPE string;
DEFINE FIELD OVERWRITE dataset            ON data_source TYPE string;
DEFINE FIELD OVERWRITE url                ON data_source TYPE string;
DEFINE FIELD OVERWRITE cadence            ON data_source TYPE string;
DEFINE FIELD OVERWRITE crs                ON data_source TYPE string;
DEFINE FIELD OVERWRITE time_semantics     ON data_source TYPE string;
DEFINE FIELD OVERWRITE license_note       ON data_source TYPE string;
DEFINE FIELD OVERWRITE known_limitations  ON data_source TYPE array<string>;
DEFINE FIELD OVERWRITE stale_after_s      ON data_source TYPE int;
DEFINE FIELD OVERWRITE dataset_updated_at ON data_source TYPE option<datetime>;
DEFINE FIELD OVERWRITE last_attempt_at    ON data_source TYPE option<datetime>;
DEFINE FIELD OVERWRITE last_success_at    ON data_source TYPE option<datetime>;
-- When the stored rows were fetched from the source; staleness is measured from this, not from load time.
DEFINE FIELD OVERWRITE last_fetched_at    ON data_source TYPE option<datetime>;

DEFINE TABLE OVERWRITE ingest_run SCHEMAFULL;
DEFINE FIELD OVERWRITE source       ON ingest_run TYPE record<data_source>;
DEFINE FIELD OVERWRITE mode         ON ingest_run TYPE string ASSERT $value IN ['live', 'snapshot'];
DEFINE FIELD OVERWRITE status       ON ingest_run TYPE string ASSERT $value IN ['running', 'succeeded', 'failed'];
DEFINE FIELD OVERWRITE started_at   ON ingest_run TYPE datetime;
DEFINE FIELD OVERWRITE finished_at  ON ingest_run TYPE option<datetime>;
DEFINE FIELD OVERWRITE params       ON ingest_run FLEXIBLE TYPE object;
DEFINE FIELD OVERWRITE report       ON ingest_run FLEXIBLE TYPE object;
DEFINE FIELD OVERWRITE requests     ON ingest_run TYPE array<string>;
DEFINE FIELD OVERWRITE error        ON ingest_run TYPE option<string>;
DEFINE FIELD OVERWRITE code_version ON ingest_run TYPE string;

DEFINE TABLE OVERWRITE area SCHEMAFULL;
DEFINE FIELD OVERWRITE code              ON area TYPE string;
DEFINE FIELD OVERWRITE name              ON area TYPE string;
DEFINE FIELD OVERWRITE geom              ON area TYPE geometry<polygon | multipolygon>;
DEFINE FIELD OVERWRITE bbox              ON area TYPE array<float>;
DEFINE FIELD OVERWRITE source            ON area TYPE record<data_source>;
DEFINE FIELD OVERWRITE source_record_id  ON area TYPE string;
DEFINE FIELD OVERWRITE source_url        ON area TYPE string;
DEFINE FIELD OVERWRITE source_updated_at ON area TYPE option<datetime>;
DEFINE FIELD OVERWRITE ingested_at       ON area TYPE datetime;
DEFINE FIELD OVERWRITE ingest_run        ON area TYPE record<ingest_run>;
DEFINE FIELD OVERWRITE raw               ON area FLEXIBLE TYPE object;

DEFINE TABLE OVERWRITE catch_basin SCHEMAFULL;
DEFINE FIELD OVERWRITE unitid            ON catch_basin TYPE string;
DEFINE FIELD OVERWRITE geom              ON catch_basin TYPE geometry<point>;
DEFINE FIELD OVERWRITE lon               ON catch_basin TYPE float;
DEFINE FIELD OVERWRITE lat               ON catch_basin TYPE float;
DEFINE FIELD OVERWRITE x_sp_ft           ON catch_basin TYPE option<float>;
DEFINE FIELD OVERWRITE y_sp_ft           ON catch_basin TYPE option<float>;
DEFINE FIELD OVERWRITE area_ids          ON catch_basin TYPE array<string>;
DEFINE FIELD OVERWRITE knowledge_type    ON catch_basin TYPE string ASSERT $value = 'observed';
DEFINE FIELD OVERWRITE source            ON catch_basin TYPE record<data_source>;
DEFINE FIELD OVERWRITE source_record_id  ON catch_basin TYPE string;
DEFINE FIELD OVERWRITE source_url        ON catch_basin TYPE string;
DEFINE FIELD OVERWRITE source_updated_at ON catch_basin TYPE option<datetime>;
DEFINE FIELD OVERWRITE ingested_at       ON catch_basin TYPE datetime;
DEFINE FIELD OVERWRITE ingest_run        ON catch_basin TYPE record<ingest_run>;
DEFINE FIELD OVERWRITE raw               ON catch_basin FLEXIBLE TYPE object;
DEFINE INDEX OVERWRITE catch_basin_unitid ON catch_basin FIELDS unitid UNIQUE;
DEFINE INDEX OVERWRITE catch_basin_lat    ON catch_basin FIELDS lat;

DEFINE TABLE OVERWRITE incident SCHEMAFULL;
DEFINE FIELD OVERWRITE category          ON incident TYPE string;
DEFINE FIELD OVERWRITE source_category   ON incident FLEXIBLE TYPE object;
DEFINE FIELD OVERWRITE geom              ON incident TYPE option<geometry<point>>;
DEFINE FIELD OVERWRITE lon               ON incident TYPE option<float>;
DEFINE FIELD OVERWRITE lat               ON incident TYPE option<float>;
DEFINE FIELD OVERWRITE address           ON incident TYPE option<string>;
DEFINE FIELD OVERWRITE reported_at       ON incident TYPE datetime;
DEFINE FIELD OVERWRITE closed_at         ON incident TYPE option<datetime>;
DEFINE FIELD OVERWRITE source_status     ON incident TYPE option<string>;
DEFINE FIELD OVERWRITE verification      ON incident FLEXIBLE TYPE object;
-- The trust rule, enforced by the database too: an agency finding needs a DEP resolution basis.
DEFINE FIELD OVERWRITE verification_status ON incident TYPE string
    ASSERT $value IN ['agency_found_obstruction', 'agency_found_defect', 'agency_cleaned', 'agency_not_found',
                      'agency_functioning', 'capacity_surcharge', 'duplicate', 'referred', 'pending',
                      'no_inspection', 'none', 'unknown', 'unverified']
       AND ($value NOT IN ['agency_found_obstruction', 'agency_found_defect', 'agency_cleaned', 'agency_not_found',
                           'agency_functioning', 'capacity_surcharge']
            OR $this.verification.basis = 'dep_311_resolution');
DEFINE FIELD OVERWRITE area_ids          ON incident TYPE array<string>;
DEFINE FIELD OVERWRITE knowledge_type    ON incident TYPE string ASSERT $value = 'reported';
DEFINE FIELD OVERWRITE source            ON incident TYPE record<data_source>;
DEFINE FIELD OVERWRITE source_record_id  ON incident TYPE string;
DEFINE FIELD OVERWRITE source_url        ON incident TYPE string;
DEFINE FIELD OVERWRITE source_updated_at ON incident TYPE option<datetime>;
DEFINE FIELD OVERWRITE ingested_at       ON incident TYPE datetime;
DEFINE FIELD OVERWRITE ingest_run        ON incident TYPE record<ingest_run>;
DEFINE FIELD OVERWRITE raw               ON incident FLEXIBLE TYPE object;
DEFINE INDEX OVERWRITE incident_lat         ON incident FIELDS lat;
DEFINE INDEX OVERWRITE incident_reported_at ON incident FIELDS reported_at;

DEFINE TABLE OVERWRITE near_basin TYPE RELATION IN incident OUT catch_basin SCHEMAFULL;
DEFINE FIELD OVERWRITE distance_ft    ON near_basin TYPE float;
DEFINE FIELD OVERWRITE method         ON near_basin TYPE string;
DEFINE FIELD OVERWRITE knowledge_type ON near_basin TYPE string ASSERT $value = 'inferred';
DEFINE FIELD OVERWRITE computed_at    ON near_basin TYPE datetime;
DEFINE INDEX OVERWRITE near_basin_in  ON near_basin FIELDS in UNIQUE;
DEFINE INDEX OVERWRITE near_basin_out ON near_basin FIELDS out;

-- FloodNet (observed) ------------------------------------------------------------------------
DEFINE TABLE OVERWRITE sensor SCHEMAFULL;
DEFINE FIELD OVERWRITE sensor_id          ON sensor TYPE string;
DEFINE FIELD OVERWRITE name               ON sensor TYPE string;
DEFINE FIELD OVERWRITE geom               ON sensor TYPE geometry<point>;
DEFINE FIELD OVERWRITE lon                ON sensor TYPE float;
DEFINE FIELD OVERWRITE lat                ON sensor TYPE float;
DEFINE FIELD OVERWRITE installed_at       ON sensor TYPE option<datetime>;
DEFINE FIELD OVERWRITE removed_at         ON sensor TYPE option<datetime>;
DEFINE FIELD OVERWRITE tidally_influenced ON sensor TYPE option<bool>;
DEFINE FIELD OVERWRITE street_name        ON sensor TYPE option<string>;
DEFINE FIELD OVERWRITE nta                ON sensor TYPE option<string>;
DEFINE FIELD OVERWRITE lowest_point_height_delta_in ON sensor TYPE option<float>;
DEFINE FIELD OVERWRITE area_ids           ON sensor TYPE array<string>;
DEFINE FIELD OVERWRITE knowledge_type     ON sensor TYPE string ASSERT $value = 'observed';
DEFINE FIELD OVERWRITE source             ON sensor TYPE record<data_source>;
DEFINE FIELD OVERWRITE source_record_id   ON sensor TYPE string;
DEFINE FIELD OVERWRITE source_url         ON sensor TYPE string;
DEFINE FIELD OVERWRITE source_updated_at  ON sensor TYPE option<datetime>;
DEFINE FIELD OVERWRITE ingested_at        ON sensor TYPE datetime;
DEFINE FIELD OVERWRITE ingest_run         ON sensor TYPE record<ingest_run>;
DEFINE FIELD OVERWRITE raw                ON sensor FLEXIBLE TYPE object;
DEFINE INDEX OVERWRITE sensor_lat         ON sensor FIELDS lat;

DEFINE TABLE OVERWRITE flood_event SCHEMAFULL;
DEFINE FIELD OVERWRITE sensor             ON flood_event TYPE record<sensor>;
DEFINE FIELD OVERWRITE sensor_id          ON flood_event TYPE string;
DEFINE FIELD OVERWRITE geom               ON flood_event TYPE geometry<point>;
DEFINE FIELD OVERWRITE lon                ON flood_event TYPE float;
DEFINE FIELD OVERWRITE lat                ON flood_event TYPE float;
DEFINE FIELD OVERWRITE started_at         ON flood_event TYPE datetime;
DEFINE FIELD OVERWRITE ended_at           ON flood_event TYPE option<datetime>;
DEFINE FIELD OVERWRITE max_depth_in       ON flood_event TYPE float;
DEFINE FIELD OVERWRITE onset_min          ON flood_event TYPE option<float>;
DEFINE FIELD OVERWRITE drain_min          ON flood_event TYPE option<float>;
DEFINE FIELD OVERWRITE duration_min       ON flood_event TYPE option<float>;
DEFINE FIELD OVERWRITE duration_above_4in_min  ON flood_event TYPE option<float>;
DEFINE FIELD OVERWRITE duration_above_12in_min ON flood_event TYPE option<float>;
DEFINE FIELD OVERWRITE duration_above_24in_min ON flood_event TYPE option<float>;
DEFINE FIELD OVERWRITE profile_depth_in   ON flood_event TYPE array<float>;
DEFINE FIELD OVERWRITE profile_t_s        ON flood_event TYPE array<float>;
DEFINE FIELD OVERWRITE tidally_influenced ON flood_event TYPE option<bool>;
DEFINE FIELD OVERWRITE knowledge_type     ON flood_event TYPE string ASSERT $value = 'observed';
DEFINE FIELD OVERWRITE source             ON flood_event TYPE record<data_source>;
DEFINE FIELD OVERWRITE source_record_id   ON flood_event TYPE string;
DEFINE FIELD OVERWRITE source_url         ON flood_event TYPE string;
DEFINE FIELD OVERWRITE source_updated_at  ON flood_event TYPE option<datetime>;
DEFINE FIELD OVERWRITE ingested_at        ON flood_event TYPE datetime;
DEFINE FIELD OVERWRITE ingest_run         ON flood_event TYPE record<ingest_run>;
DEFINE FIELD OVERWRITE raw                ON flood_event FLEXIBLE TYPE object;
DEFINE INDEX OVERWRITE flood_event_lat        ON flood_event FIELDS lat;
DEFINE INDEX OVERWRITE flood_event_started_at ON flood_event FIELDS started_at;
DEFINE INDEX OVERWRITE flood_event_sensor     ON flood_event FIELDS sensor_id;

-- Rainfall scenarios, simulation runs and their predicted results ---------------------------
DEFINE TABLE OVERWRITE rainfall_scenario SCHEMAFULL;
DEFINE FIELD OVERWRITE name              ON rainfall_scenario TYPE string;
DEFINE FIELD OVERWRITE kind              ON rainfall_scenario TYPE string ASSERT $value IN ['design_storm', 'nws_forecast', 'custom'];
DEFINE FIELD OVERWRITE area_id           ON rainfall_scenario TYPE string;
DEFINE FIELD OVERWRITE step_min          ON rainfall_scenario TYPE int;
DEFINE FIELD OVERWRITE intensities_in_hr ON rainfall_scenario TYPE array<float>;
DEFINE FIELD OVERWRITE total_depth_in    ON rainfall_scenario TYPE float;
DEFINE FIELD OVERWRITE peak_in_hr        ON rainfall_scenario TYPE float;
DEFINE FIELD OVERWRITE duration_min      ON rainfall_scenario TYPE int;
DEFINE FIELD OVERWRITE assumptions       ON rainfall_scenario TYPE array<string>;
DEFINE FIELD OVERWRITE source_ref        ON rainfall_scenario FLEXIBLE TYPE option<object>;
DEFINE FIELD OVERWRITE content_hash      ON rainfall_scenario TYPE string;
DEFINE FIELD OVERWRITE created_at        ON rainfall_scenario TYPE datetime;
DEFINE FIELD OVERWRITE created_by        ON rainfall_scenario TYPE string;

DEFINE TABLE OVERWRITE simulation_run SCHEMAFULL;
DEFINE FIELD OVERWRITE scenario      ON simulation_run TYPE record<rainfall_scenario>;
DEFINE FIELD OVERWRITE area_id       ON simulation_run TYPE string;
DEFINE FIELD OVERWRITE runner        ON simulation_run TYPE string ASSERT $value IN ['local', 'daytona'];
DEFINE FIELD OVERWRITE status        ON simulation_run TYPE string ASSERT $value IN ['queued', 'running', 'succeeded', 'failed', 'timed_out'];
DEFINE FIELD OVERWRITE params        ON simulation_run FLEXIBLE TYPE object;
DEFINE FIELD OVERWRITE model         ON simulation_run FLEXIBLE TYPE object;
DEFINE FIELD OVERWRITE queued_at     ON simulation_run TYPE datetime;
DEFINE FIELD OVERWRITE started_at    ON simulation_run TYPE option<datetime>;
DEFINE FIELD OVERWRITE finished_at   ON simulation_run TYPE option<datetime>;
DEFINE FIELD OVERWRITE timeout_s     ON simulation_run TYPE int;
DEFINE FIELD OVERWRITE inp_sha256    ON simulation_run TYPE option<string>;
DEFINE FIELD OVERWRITE summary       ON simulation_run FLEXIBLE TYPE option<object>;
DEFINE FIELD OVERWRITE error         ON simulation_run FLEXIBLE TYPE option<object>;
DEFINE FIELD OVERWRITE runner_meta   ON simulation_run FLEXIBLE TYPE option<object>;
DEFINE FIELD OVERWRITE artifacts_dir ON simulation_run TYPE option<string>;
DEFINE FIELD OVERWRITE code_version  ON simulation_run TYPE string;
DEFINE INDEX OVERWRITE simulation_run_queued ON simulation_run FIELDS queued_at;

DEFINE TABLE OVERWRITE flood_result SCHEMAFULL;
DEFINE FIELD OVERWRITE run                 ON flood_result TYPE record<simulation_run>;
DEFINE FIELD OVERWRITE basin               ON flood_result TYPE record<catch_basin>;
DEFINE FIELD OVERWRITE geom                ON flood_result TYPE geometry<point>;
DEFINE FIELD OVERWRITE lon                 ON flood_result TYPE float;
DEFINE FIELD OVERWRITE lat                 ON flood_result TYPE float;
DEFINE FIELD OVERWRITE hours_flooded       ON flood_result TYPE float;
DEFINE FIELD OVERWRITE max_flood_rate_cfs  ON flood_result TYPE float;
DEFINE FIELD OVERWRITE flood_volume_ft3    ON flood_result TYPE float;
DEFINE FIELD OVERWRITE max_ponded_depth_in ON flood_result TYPE float;
DEFINE FIELD OVERWRITE risk_class          ON flood_result TYPE string ASSERT $value IN ['minor', 'nuisance', 'deep'];
DEFINE FIELD OVERWRITE catchment_ac        ON flood_result TYPE option<float>;
DEFINE FIELD OVERWRITE inlet_height_ft     ON flood_result TYPE float;
DEFINE FIELD OVERWRITE blockage_applied    ON flood_result TYPE bool;
DEFINE FIELD OVERWRITE knowledge_type      ON flood_result TYPE string ASSERT $value = 'predicted';
DEFINE FIELD OVERWRITE generated_at        ON flood_result TYPE datetime;
DEFINE INDEX OVERWRITE flood_result_run    ON flood_result FIELDS run;
DEFINE INDEX OVERWRITE flood_result_basin  ON flood_result FIELDS basin;
