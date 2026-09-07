-- A report period isn't automatically a 7-day week — configurable per
-- role, e.g. 5 for a Mon-Fri work week.
ALTER TABLE `MealTransportReportConfig` ADD COLUMN `periodDays` INT NOT NULL DEFAULT 7;
