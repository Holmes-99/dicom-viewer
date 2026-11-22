-- Local SQLite schema for the viewer. No server, no user accounts: every file lives on the user's PC.
-- Two kinds of database file:
--   app.db                 settings, PACS nodes, presets, key bindings, the list of archives
--   <archive>/archive.db   one per local archive (the original allows several): patients -> studies -> series -> instances
-- Conventions: integer primary keys (rowid) for speed; DICOM UIDs are unique natural keys.
-- Times we create are ISO-8601 UTC text. DICOM dates/times (DA/TM) are stored as the raw strings,
-- because DICOM has no time zone and converting them would corrupt them.
-- Access rules: none in the database. It is a single-user local file, protected by Windows file permissions.
-- PRAGMA foreign_keys = ON is required on every connection.

------------------------------------------------------------------------------------------------
-- app.db
------------------------------------------------------------------------------------------------

create table archives (
  id          integer primary key,
  name        text not null unique,
  path        text not null unique,              -- folder holding archive.db and the copied files
  is_default  integer not null default 0 check (is_default in (0,1)),
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table pacs_nodes (
  id                 integer primary key,
  name               text not null unique,
  ae_title           text not null check (length(ae_title) between 1 and 16),
  host               text not null,
  port               integer not null check (port between 1 and 65535),
  retrieve_method    text not null default 'move' check (retrieve_method in ('move','get')),
  allowed_syntaxes   text,                        -- JSON array; null = propose all (legacy PACS fix, 2024.2)
  query_timeout_s    integer not null default 30,
  search_presets     text not null default '[]',  -- JSON
  created_at         text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table listener (                           -- the local C-STORE SCP; a single row
  id               integer primary key check (id = 1),
  enabled          integer not null default 0,
  ae_title         text not null default 'VIEWER',
  port             integer not null default 11112 check (port between 1 and 65535),
  destination      text not null default 'temp' check (destination in ('temp','archive')),
  archive_id       integer references archives(id) on delete set null,
  allow_unknown    integer not null default 0,     -- reject hosts not in pacs_nodes (2025.2)
  pause_on_lock    integer not null default 1
);

create table window_presets (
  id          integer primary key,
  name        text not null,
  scope       text not null check (scope in ('2d','mpr','vr')),
  modality    text,                               -- null = any
  center      real,                               -- 2d/mpr
  width       real check (width is null or width > 0),
  vr_transfer text,                               -- JSON colour/opacity curve for vr presets
  builtin     integer not null default 0,
  sort_order  integer not null default 0,
  unique (scope, name)
);

create table key_bindings (
  action      text primary key,                   -- e.g. 'tool.length', 'view.invert'
  keys        text,                               -- e.g. 'Ctrl+Shift+N'
  mouse       text                                -- e.g. 'Left', 'Right+Ctrl', 'XButton1'
);

create table anon_templates (
  id          integer primary key,
  name        text not null unique,
  rules       text not null,                      -- JSON: [{tag, action: remove|blank|replace|keep, value}]
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table settings (
  key         text primary key,                   -- replaces the original's options.xml
  value       text not null
);

------------------------------------------------------------------------------------------------
-- archive.db (one per archive)
------------------------------------------------------------------------------------------------

create table patients (
  id           integer primary key,
  patient_id   text not null,                      -- (0010,0020); not unique across issuers
  issuer       text not null default '',           -- (0010,0021)
  name         text,                               -- (0010,0010), already decoded to UTF-8
  birth_date   text,                               -- DA string
  sex          text,
  unique (patient_id, issuer, name, birth_date)
);
create index patients_name on patients (name collate nocase);

create table studies (
  id            integer primary key,
  patient_ref   integer not null references patients(id) on delete cascade,
  study_uid     text not null unique,
  study_date    text,
  study_time    text,
  accession     text,
  description   text,
  modalities    text,                              -- e.g. 'CT\PT'
  referring     text,
  num_series    integer not null default 0,
  num_instances integer not null default 0,
  imported_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index studies_patient on studies (patient_ref);
create index studies_date    on studies (study_date);
create index studies_access  on studies (accession);

create table series (
  id             integer primary key,
  study_ref      integer not null references studies(id) on delete cascade,
  series_uid     text not null unique,
  modality       text,
  series_number  integer,
  description    text,
  frame_of_ref   text,                             -- drives auto-sync
  body_part      text,
  num_instances  integer not null default 0
);
create index series_study on series (study_ref);
create index series_for   on series (frame_of_ref);

create table instances (
  id               integer primary key,
  series_ref       integer not null references series(id) on delete cascade,
  sop_uid          text not null unique,
  sop_class        text not null,
  instance_number  integer,
  file_path        text not null,                  -- relative to the archive folder
  file_size        integer not null,
  transfer_syntax  text not null,
  frames           integer not null default 1,
  rows             integer,
  cols             integer,
  position         text,                           -- ImagePositionPatient 'x\y\z'
  orientation      text,                           -- ImageOrientationPatient
  acq_time         text
);
create index instances_series on instances (series_ref, instance_number);

create table keywords (
  id    integer primary key,
  text  text not null unique collate nocase
);

create table study_keywords (
  study_ref    integer not null references studies(id) on delete cascade,
  keyword_ref  integer not null references keywords(id) on delete cascade,
  primary key (study_ref, keyword_ref)
);
create index study_keywords_kw on study_keywords (keyword_ref);

-- Full-text search over the archive list (names, IDs, descriptions, keywords): supports 'a | b' OR search.
create virtual table study_search using fts5 (
  name, patient_id, accession, description, keywords,
  content='', tokenize='unicode61 remove_diacritics 2'
);
