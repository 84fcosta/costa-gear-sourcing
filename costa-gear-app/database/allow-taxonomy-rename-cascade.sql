alter table public.products
  drop constraint if exists products_product_type_fkey,
  add constraint products_product_type_fkey
    foreign key (product_type)
    references public.product_types(name)
    on update cascade;

alter table public.products
  drop constraint if exists products_material_fkey,
  add constraint products_material_fkey
    foreign key (material)
    references public.product_materials(name)
    on update cascade;
