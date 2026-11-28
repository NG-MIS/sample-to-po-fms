-- By-product consumption: cloth a garment needs that is not in the drawing (a flower,
-- piping). Each drawing row can carry several, each as: item, metres of cloth, pieces
-- made from that cloth, and pieces on one garment. The cloth per garment is
-- metres / pieces made x pieces per garment. A fabric material list keeps the total of
-- these per garment on its line (by_product), so it is counted in the cloth needed.

alter table public.cad_rows add column by_products jsonb not null default '[]'::jsonb
  constraint cad_rows_by_products_check check (jsonb_typeof(by_products) = 'array');
alter table public.material_items add column by_product numeric(12, 4)
  constraint material_items_by_product_check check (by_product is null or by_product >= 0);

-- Checks and tidies the by-products of one drawing row.
create or replace function private.clean_by_products(p_items jsonb)
returns jsonb
language plpgsql
immutable
set search_path to ''
as $function$
declare
  b jsonb;
  v_out jsonb := '[]'::jsonb;
  v_name text;
  v_mtr numeric;
  v_pcs numeric;
  v_per numeric;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return v_out;
  end if;
  for b in select * from jsonb_array_elements(p_items) loop
    v_name := btrim(regexp_replace(coalesce(b ->> 'name', ''), '\s+', ' ', 'g'));
    v_mtr := round(nullif(btrim(b ->> 'mtr'), '')::numeric, 2);
    v_pcs := nullif(btrim(b ->> 'pcs'), '')::numeric;
    v_per := coalesce(nullif(btrim(b ->> 'per_garment'), '')::numeric, 1);
    if v_name = '' then
      raise exception 'Every by-product needs its item name';
    end if;
    if char_length(v_name) > 80 then
      raise exception 'A by-product name can be at most 80 characters long';
    end if;
    if v_mtr is null or v_mtr <= 0 then
      raise exception 'Enter the metres of cloth, more than zero, for every by-product';
    end if;
    if v_pcs is null or v_pcs < 1 or v_pcs <> trunc(v_pcs) then
      raise exception 'Pieces made from the cloth must be a whole number, 1 or more, for every by-product';
    end if;
    if v_per < 1 or v_per <> trunc(v_per) then
      raise exception 'Pieces per garment must be a whole number, 1 or more, for every by-product';
    end if;
    v_out := v_out || jsonb_build_object('name', v_name, 'mtr', v_mtr, 'pcs', v_pcs::integer, 'per_garment', v_per::integer);
  end loop;
  return v_out;
end
$function$;
revoke all on function private.clean_by_products(jsonb) from public, anon, authenticated;

-- save_cad keeps the by-products of each row; save_material_list keeps the by-product
-- cloth per garment of each fabric line. Patched in place: only the lines named here change.
do $patch$
declare
  v_def text;
  v_changes text[][] := array[
    ['save_cad', $a$  v_efficiency numeric;
$a$, $b$  v_efficiency numeric;
  v_by jsonb;
$b$],
    ['save_cad', $a$      raise exception 'Every drawing row needs its Msrmnt, Paina, No. of pcs in layer, No of panels and Efficiency';
    end if;
$a$, $b$      raise exception 'Every drawing row needs its Msrmnt, Paina, No. of pcs in layer, No of panels and Efficiency';
    end if;
    v_by := private.clean_by_products(e -> 'by_products');
$b$],
    ['save_cad', $a$(cad_id, position, particular_id, fabric_type, msrmnt, paina, pcs_in_layer, panels, component_ids, efficiency)$a$,
                 $b$(cad_id, position, particular_id, fabric_type, msrmnt, paina, pcs_in_layer, panels, component_ids, efficiency, by_products)$b$],
    ['save_cad', $a$        v_components, v_efficiency
      )$a$, $b$        v_components, v_efficiency, v_by
      )$b$],
    ['save_cad', $a$component_ids = v_components, efficiency = v_efficiency$a$, $b$component_ids = v_components, efficiency = v_efficiency, by_products = v_by$b$],
    ['save_material_list', $a$msrmnt, pcs_in_layer, paina, fabric_vendor_id, rate, created_by)$a$, $b$msrmnt, pcs_in_layer, paina, by_product, fabric_vendor_id, rate, created_by)$b$],
    ['save_material_list', $a$          nullif(btrim(e ->> 'paina'), '')::numeric, v_vendor, round(nullif(btrim(e ->> 'rate'), '')::numeric, 2), v_me$a$,
                           $b$          nullif(btrim(e ->> 'paina'), '')::numeric, round(nullif(btrim(e ->> 'by_product'), '')::numeric, 4),
          v_vendor, round(nullif(btrim(e ->> 'rate'), '')::numeric, 2), v_me$b$],
    ['save_material_list', $a$            paina = nullif(btrim(e ->> 'paina'), '')::numeric,
$a$, $b$            paina = nullif(btrim(e ->> 'paina'), '')::numeric,
            by_product = round(nullif(btrim(e ->> 'by_product'), '')::numeric, 4),
$b$]
  ];
  i integer;
begin
  for i in 1 .. array_length(v_changes, 1) loop
    select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_changes[i][1];
    if position(v_changes[i][2] in v_def) = 0 then
      raise exception '% does not have the expected lines (change %)', v_changes[i][1], i;
    end if;
    execute replace(v_def, v_changes[i][2], v_changes[i][3]);
  end loop;
end
$patch$;
