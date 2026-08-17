-- ============================================================
-- CANTINHO DO PETISCO
-- MIGRAÇÃO: PRATO DO DIA POR DIA DA SEMANA
-- Execute UMA VEZ no SQL Editor do Supabase como postgres.
-- 0 = Domingo, 1 = Segunda, 2 = Terça, 3 = Quarta,
-- 4 = Quinta, 5 = Sexta, 6 = Sábado.
-- ============================================================

reset role;

begin;

-- Adiciona a nova coluna sem quebrar registros antigos.
alter table public.daily_specials
    add column if not exists weekday smallint;

-- Converte pratos antigos por DATA para o respectivo dia da semana.
-- EXTRACT(DOW): domingo=0 ... sábado=6.
update public.daily_specials
set weekday = extract(dow from special_date)::smallint
where weekday is null
  and special_date is not null;

-- Se havia várias datas históricas para o mesmo dia da semana,
-- mantém somente a programação mais recentemente atualizada.
with ranked as (
    select id,
           row_number() over (
             partition by weekday
             order by updated_at desc nulls last, created_at desc nulls last, id
           ) as rn
    from public.daily_specials
    where weekday is not null
)
delete from public.daily_specials d
using ranked r
where d.id = r.id
  and r.rn > 1;

-- Validação do novo campo.
alter table public.daily_specials
    drop constraint if exists daily_specials_weekday_check;

alter table public.daily_specials
    add constraint daily_specials_weekday_check
    check (weekday between 0 and 6);

alter table public.daily_specials
    alter column weekday set not null;

-- A antiga data deixa de ser obrigatória; é mantida apenas para
-- compatibilidade/registro de migração e não é mais usada pelo site.
alter table public.daily_specials
    alter column special_date drop not null;

-- Garante apenas uma programação por dia da semana.
create unique index if not exists daily_specials_weekday_unique_idx
    on public.daily_specials(weekday);

create index if not exists daily_specials_weekday_idx
    on public.daily_specials(weekday, active);

commit;

-- Conferência final:
select
    weekday,
    case weekday
      when 0 then 'Domingo'
      when 1 then 'Segunda-feira'
      when 2 then 'Terça-feira'
      when 3 then 'Quarta-feira'
      when 4 then 'Quinta-feira'
      when 5 then 'Sexta-feira'
      when 6 then 'Sábado'
    end as dia,
    product_id,
    special_price,
    note,
    active
from public.daily_specials
order by case when weekday = 0 then 7 else weekday end;
