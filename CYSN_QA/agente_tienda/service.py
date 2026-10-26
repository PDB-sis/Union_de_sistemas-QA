import logging, sys
from logging.handlers import RotatingFileHandler
from pathlib import Path
import servicemanager, win32event, win32service, win32serviceutil
ROOT=Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent; sys.path.insert(0,str(ROOT))
from qa_agent import config, ciclo
LOG=logging.getLogger("nexoqaa.agent")
class NexoQAAgente(win32serviceutil.ServiceFramework):
    _svc_name_="NexoQAAgenteTienda"; _svc_display_name_="NEXO QA - Agente de Tienda"
    _svc_description_="Envía a la API central NEXO QA los cambios del SQL Server del sitio: inventario y, en bodegas, transferencias, devoluciones y usuarios (solo lectura)."
    def __init__(self,args): win32serviceutil.ServiceFramework.__init__(self,args); self.stop=win32event.CreateEvent(None,0,0,None)
    def SvcStop(self): self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING); win32event.SetEvent(self.stop)
    def SvcDoRun(self):
        handler=RotatingFileHandler(ROOT/"agente.log",maxBytes=1_000_000,backupCount=5,encoding="utf-8")
        logging.basicConfig(level=logging.INFO,format="%(asctime)s %(levelname)s %(message)s",handlers=[handler])
        try: c=config()
        except Exception: LOG.exception("No se pudo leer config.env; el servicio se detiene."); return
        LOG.info("Servicio iniciado.")
        while True:
            try: LOG.info("Resultado: %s",ciclo(c))
            except Exception: LOG.exception("Sincronización falló; lo no enviado se reintenta en el siguiente ciclo")
            if win32event.WaitForSingleObject(self.stop,max(30,int(c.get("SYNC_INTERVAL_SECONDS","60")))*1000)==win32event.WAIT_OBJECT_0: break
        LOG.info("Servicio detenido.")
if __name__=="__main__":
    if len(sys.argv)==1:
        # Así lo arranca Windows (sin argumentos): el ejecutable congelado debe atender al administrador de servicios.
        servicemanager.Initialize(); servicemanager.PrepareToHostSingle(NexoQAAgente); servicemanager.StartServiceCtrlDispatcher()
    else: win32serviceutil.HandleCommandLine(NexoQAAgente)
