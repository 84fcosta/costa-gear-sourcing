create or replace function public.build_costa_gear_product_name(
  p_product_type text,
  p_variant_name text,
  p_material text
)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select nullif(
    concat_ws(
      ' – ',
      case
        when lower(trim(coalesce(p_product_type,''))) = 'other' then null
        else nullif(trim(p_product_type),'')
      end,
      nullif(trim(p_variant_name),''),
      nullif(trim(p_material),'')
    ),
    ''
  );
$function$;

update public.products
set name = public.build_costa_gear_product_name(product_type,variant_name,material)
where lower(trim(product_type))='other';
