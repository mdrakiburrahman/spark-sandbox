{{
    config(
        materialized='table',
        file_format='delta',
        location_root='none'
    )
}}

SELECT
    sha2(status, 256) AS health_status_key,
    status,
    description,
    severity_rank
FROM (
    VALUES
    ('Healthy', 'All monitored metrics are within expected bounds.', 1),
    ('Training', 'Insufficient historical data to determine health status. Minimum thresholds not yet met.', 2),
    ('Unhealthy', 'One or more monitored metrics are outside expected bounds, indicating potential data quality issues.', 3)
) AS t (status, description, severity_rank)
