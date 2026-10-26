import {Prisma} from "../../../generated/prisma/client";
import {compare} from "./comparator";

export function photoComparison(previous:string|null,current:string|null,hasPrevious:boolean,hasCurrent:boolean){
  const estado=!hasCurrent?"Sin fotografía":!hasPrevious?"Primera fotografía":previous===null&&current===null?"Fuera de fotografía":compare(previous,current);
  const variacionUnidades=hasPrevious&&hasCurrent&&previous!==null&&current!==null
    ?new Prisma.Decimal(current).abs().sub(new Prisma.Decimal(previous).abs()).toFixed(4):null;
  return {estado,anterior:previous,actual:current,variacionUnidades};
}
