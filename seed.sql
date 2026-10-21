-- 測試資料(可選):貼到 Supabase SQL Editor 執行
with p as (
  insert into projects (customer, model, status, pending, start_date, end_date, note) values
    ('Acme',   'AX-100', 'NPI', false, '2026-01-05', '2027-03-31', 'DVT 進行中'),
    ('Globex', 'GX-20',  'MP',  false, '2025-02-01', '2027-12-31', '已量產'),
    ('Initech','IN-7',   'BD',  false, null,         null,         '報價中'),
    ('Umbrella','UM-3',  'NPI', true,  '2026-03-01', null,         '客戶暫停'),
    ('Hooli',  'HL-9',   'NPI', false, '2026-06-01', '2027-09-30', 'EVT 準備中')
  returning id, model
)
insert into milestones (project_id, phase, target_date)
select p.id, m.phase, m.target_date::date
from p join (values
  ('AX-100','EVT','2026-04-30'), ('AX-100','DVT','2026-12-15'), ('AX-100','PVT','2027-02-15'), ('AX-100','MP','2027-03-31'),
  ('GX-20','EVT','2025-05-30'),  ('GX-20','DVT','2025-09-30'),  ('GX-20','PVT','2025-12-15'),  ('GX-20','MP','2026-02-01'),
  ('HL-9','EVT','2026-12-31'),   ('HL-9','DVT','2027-03-31'),   ('HL-9','PVT','2027-07-15'),   ('HL-9','MP','2027-09-30')
) as m(model, phase, target_date) on m.model = p.model;

-- ==========================================
-- 人員配置測試資料(可選):請在上面專案資料已存在後再執行
-- ==========================================
with m as (
  insert into members (name, role, email) values
    ('王小明', 'FW', 'ming@example.com'),
    ('李小華', 'QA', 'hua@example.com'),
    ('陳大文', 'PM', 'wen@example.com')
  returning id, name
)
insert into allocations (project_id, member_id, start_date, end_date, percentage)
select p.id, m.id, a.s::date, a.e::date, a.pct
from (values
  ('AX-100','王小明','2026-01-05','2026-12-31',60),
  ('AX-100','李小華','2026-06-01','2027-02-28',40),
  ('AX-100','陳大文','2026-01-05','2027-03-31',20),
  ('HL-9',  '王小明','2027-01-01','2027-06-30',30),
  ('HL-9',  '李小華','2026-10-01','2026-12-31',50)
) as a(model, name, s, e, pct)
join projects p on p.model = a.model
join m on m.name = a.name;
