SELECT
    migration_name,
    finished_at,
    rolled_back_at,
    started_at,
    logs
FROM `_prisma_migrations`
WHERE migration_name = '20260810130000_normalize_geo_fk';
