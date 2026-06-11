-- Glow Dashboard V2 - T-Max and Wix availability sync foundation
-- Run in Supabase SQL editor before relying on booking-level Wix block status.

alter table "Bookings"
add column if not exists synced_to_wix boolean default false,
add column if not exists wix_block_id text,
add column if not exists wix_sync_status text,
add column if not exists wix_sync_error text,
add column if not exists last_wix_sync_at timestamp with time zone,
add column if not exists tmax_room integer,
add column if not exists tmax_bridge_status text,
add column if not exists tmax_bridge_error text;

create index if not exists bookings_wix_sync_status_idx on "Bookings" (wix_sync_status);
create index if not exists bookings_wix_block_id_idx on "Bookings" (wix_block_id);

create table if not exists "DashboardSettings" (
  setting_key text primary key,
  setting_value jsonb,
  updated_at timestamp with time zone default now(),
  updated_by text
);

comment on table "DashboardSettings" is 'Manager-controlled dashboard integration settings such as T-Max and Wix availability sync toggles.';
comment on column "Bookings".synced_to_wix is 'True when a dashboard-created booking has an active Wix availability block.';
comment on column "Bookings".wix_block_id is 'Wix availability block identifier created for dashboard-originated bookings.';
comment on column "Bookings".wix_sync_status is 'pending, synced, failed, removed, or skipped for dashboard-to-Wix availability blocking.';
comment on column "Bookings".tmax_room is 'Physical T-Max room number used for the session, where applicable.';
