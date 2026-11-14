CREATE TABLE IF NOT EXISTS scanmon_pvp_rooms (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
