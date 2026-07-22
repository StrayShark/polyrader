-- Prevent high-win-rate but negative-return wallets from qualifying for paper copy.
ALTER TABLE wallet_copy_config ADD COLUMN min_leader_roi REAL DEFAULT 0.02;
