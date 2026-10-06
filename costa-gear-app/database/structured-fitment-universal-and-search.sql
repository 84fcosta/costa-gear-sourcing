-- Structured fitment improvements: year-aware search support and governed Universal fitment.
-- Universal is a non-model-specific fitment and therefore carries no model-year restriction.
-- Existing products that used "Universal" only as free-text notes are normalized into structured fitment data.

begin;

insert into public.vehicle_fitments(
  code,
  make,
  model,
  platform,
  doors,
  powertrain,
  display_name,
  sort_order,
  active,
  model_year_start,
  model_year_end
)
values(
  'UNIVERSAL',
  'Universal',
  'Universal',
  'Universal',
  null,
  null,
  'Universal',
  90,
  true,
  null,
  null
)
on conflict (code) do update
set display_name = excluded.display_name,
    sort_order = excluded.sort_order,
    active = true,
    model_year_start = null,
    model_year_end = null;

create or replace function public.set_product_fitments(
  p_product_id uuid,
  p_fitments jsonb,
  p_fitment_notes text default null::text
)
returns text
language plpgsql
set search_path to 'public'
as $function$
declare
  v_item jsonb;
  v_code text;
  v_from integer;
  v_to integer;
  v_model_start integer;
  v_model_end integer;
  v_open_max integer;
begin
  if not exists(select 1 from public.app_members m where m.user_id=(select auth.uid())) then
    raise exception 'Not authorized.';
  end if;

  if not exists(select 1 from public.products p where p.id=p_product_id) then
    raise exception 'Product not found.';
  end if;

  if coalesce(jsonb_typeof(p_fitments),'')<>'array' or jsonb_array_length(p_fitments)=0 then
    raise exception 'Select at least one vehicle fitment.';
  end if;

  v_open_max := extract(year from current_date)::integer + 1;

  delete from public.product_fitments where product_id=p_product_id;

  for v_item in select value from jsonb_array_elements(p_fitments)
  loop
    v_code := nullif(trim(v_item->>'code'),'');
    v_from := nullif(v_item->>'yearFrom','')::integer;
    v_to := nullif(v_item->>'yearTo','')::integer;

    select model_year_start, model_year_end
      into v_model_start, v_model_end
    from public.vehicle_fitments vf
    where vf.code=v_code and vf.active=true;

    if not found then
      raise exception 'Select a valid active vehicle fitment.';
    end if;

    if v_code='UNIVERSAL' then
      insert into public.product_fitments(product_id,fitment_code,year_from,year_to)
      values(p_product_id,v_code,null,null);
      continue;
    end if;

    if v_from is null then
      raise exception 'Select a starting year for every vehicle fitment.';
    end if;

    if v_model_start is not null and v_from < v_model_start then
      raise exception 'Model year % is before the first valid year (%) for %.', v_from, v_model_start, v_code;
    end if;

    if v_model_end is not null and v_from > v_model_end then
      raise exception 'Model year % is after the last valid year (%) for %.', v_from, v_model_end, v_code;
    end if;

    if v_model_end is null and v_from > v_open_max then
      raise exception 'Model year % is beyond the currently supported model-year horizon (%) for %.', v_from, v_open_max, v_code;
    end if;

    if v_model_end is not null and v_to is null then
      raise exception 'Select an end year for discontinued platform % (%-%).', v_code, v_model_start, v_model_end;
    end if;

    if v_to is not null and v_to<v_from then
      raise exception 'Fitment end year cannot be earlier than the starting year.';
    end if;

    if v_to is not null and v_model_end is not null and v_to > v_model_end then
      raise exception 'End year % is after the last valid year (%) for %.', v_to, v_model_end, v_code;
    end if;

    if v_to is not null and v_model_end is null and v_to > v_open_max then
      raise exception 'End year % is beyond the currently supported model-year horizon (%) for %.', v_to, v_open_max, v_code;
    end if;

    insert into public.product_fitments(product_id,fitment_code,year_from,year_to)
    values(p_product_id,v_code,v_from,v_to);
  end loop;

  update public.products
  set fitment_notes=nullif(trim(p_fitment_notes),'')
  where id=p_product_id;

  return public.refresh_product_fitment_display(p_product_id);
end;
$function$;

-- Normalize the four audited legacy records where Universal was stored only in fitment_notes.
insert into public.product_fitments(product_id, fitment_code, year_from, year_to)
select p.id, 'UNIVERSAL', null, null
from public.products p
where p.sku_id in ('CG-AW-01','CG-AW-02','CG-CR-02','CG-TB-01')
on conflict (product_id, fitment_code) do nothing;

update public.products
set fitment_notes = case sku_id
  when 'CG-AW-01' then 'Roof Rack Mounted'
  when 'CG-AW-02' then 'Roof Rack Mounted.'
  when 'CG-CR-02' then null
  when 'CG-TB-01' then null
  else fitment_notes
end
where sku_id in ('CG-AW-01','CG-AW-02','CG-CR-02','CG-TB-01');

select public.refresh_product_fitment_display(id)
from public.products
where sku_id in ('CG-AW-01','CG-AW-02','CG-CR-02','CG-TB-01');

commit;
