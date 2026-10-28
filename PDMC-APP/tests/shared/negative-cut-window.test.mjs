import test from "node:test";
import assert from "node:assert/strict";
import {negativeCutWindow,negativeWeekRange} from "../../shared/negativos/cut-window.ts";

test("el primer corte semanal admite cargas tardías sin mezclar las dos ventanas",()=>{
  for(const [date,type,start,end] of [
    ["2026-10-05","LUNES","2026-10-05","2026-10-08"],
    ["2026-10-06","LUNES","2026-10-05","2026-10-08"],
    ["2026-10-07","LUNES","2026-10-05","2026-10-08"],
    ["2026-10-08","JUEVES","2026-10-08","2026-10-12"],
    ["2026-10-11","JUEVES","2026-10-08","2026-10-12"],
  ]){
    const window=negativeCutWindow(new Date(`${date}T12:00:00.000Z`));
    assert.equal(window.tipo,type);assert.equal(window.gte.toISOString().slice(0,10),start);assert.equal(window.lt.toISOString().slice(0,10),end);
  }
});

test("las dos ventanas pertenecen a una sola semana operativa",()=>{
  for(const date of ["2026-10-05","2026-10-07","2026-10-08","2026-10-11"]){
    const week=negativeWeekRange(new Date(`${date}T12:00:00.000Z`));
    assert.equal(week.gte.toISOString().slice(0,10),"2026-10-05");
    assert.equal(week.lt.toISOString().slice(0,10),"2026-10-12");
  }
});
