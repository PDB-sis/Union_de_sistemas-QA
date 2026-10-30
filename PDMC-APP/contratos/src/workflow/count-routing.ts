export type CountWorkflow="conteo"|"gestion";

export function countWorkflow(canCount:boolean,canEdit:boolean):CountWorkflow{
  return canCount&&!canEdit?"conteo":"gestion";
}

export function countVisibility(workflow:CountWorkflow):{conteoFisico:null}|{conteoFisico:{not:null}}{
  return workflow==="conteo"?{conteoFisico:null}:{conteoFisico:{not:null}};
}
