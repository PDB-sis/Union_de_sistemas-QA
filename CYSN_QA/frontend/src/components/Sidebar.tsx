import type { NexoQaController } from "../hooks/useNexoQaController";

interface SidebarProps {
  controller: NexoQaController;
}

export function Sidebar({ controller }: SidebarProps) {
  const {
    menuActivo,
    setMenuActivo,
    abrirConsultaGeneral,
    abrirMetricas,
    abrirDashboard,
    abrirTipoDiferencia,
    abrirCorregidos,
    abrirHistorial,
    abrirUsuarios,
    abrirPerfil,
  } = controller;

  return (
    <aside className="nexo-sidebar">
      {/* ====================================================== */}
      {/* MARCA / LOGO                                           */}
      {/* ====================================================== */}

      <div className="nexo-sidebar-brand">
        <div className="nexo-sidebar-logo">NQ</div>

        <div>
          <strong>NEXO QA</strong>
          <span>Control de calidad</span>
        </div>
      </div>

      {/* ====================================================== */}
      {/* NAVEGACIÓN                                             */}
      {/* ====================================================== */}

      <nav className="nexo-sidebar-nav">
        {/* ==================================================== */}
        {/* GENERAL                                              */}
        {/* ==================================================== */}

        <div className="nexo-sidebar-group">GENERAL</div>

        <button
          type="button"
          className={
            menuActivo === "consulta"
              ? "nexo-nav-item is-active"
              : "nexo-nav-item"
          }
          title="Consulta General"
          onClick={abrirConsultaGeneral}
        >
          <span className="nexo-nav-icon">▦</span>
          <span>Consulta General</span>
        </button>

        <button
          type="button"
          className={
            menuActivo === "metricas"
              ? "nexo-nav-item is-active"
              : "nexo-nav-item"
          }
          title="Métricas"
          onClick={abrirMetricas}
        >
          <span className="nexo-nav-icon">%</span>
          <span>Métricas</span>
        </button>

        <button
          type="button"
          className={
            menuActivo === "dashboard"
              ? "nexo-nav-item is-active"
              : "nexo-nav-item"
          }
          title="Dashboard"
          onClick={abrirDashboard}
        >
          <span className="nexo-nav-icon">◫</span>
          <span>Dashboard</span>
        </button>


        {/* ==================================================== */}
        {/* DIFERENCIAS                                          */}
        {/* ==================================================== */}

        <div className="nexo-sidebar-group">DIFERENCIAS</div>

        <button
          type="button"
          className={
            menuActivo === "referencia"
              ? "nexo-nav-item is-active"
              : "nexo-nav-item"
          }
          title="Referencia"
          onClick={() =>
            abrirTipoDiferencia(
              "REFERENCIA",
              "referencia",
            )
          }
        >
          <span className="nexo-nav-letter">R</span>
          <span>Referencia</span>
        </button>

        <button
          type="button"
          className={
            menuActivo === "codigo-marca"
              ? "nexo-nav-item is-active"
              : "nexo-nav-item"
          }
          title="Código Marca"
          onClick={() =>
            abrirTipoDiferencia(
              "CODIGO_MARCA",
              "codigo-marca",
            )
          }
        >
          <span className="nexo-nav-letter">M</span>
          <span>Código Marca</span>
        </button>

        <button
          type="button"
          className={
            menuActivo === "precio-detal"
              ? "nexo-nav-item is-active"
              : "nexo-nav-item"
          }
          title="Precio Detal"
          onClick={() =>
            abrirTipoDiferencia(
              "PRECIO_DETAL",
              "precio-detal",
            )
          }
        >
          <span className="nexo-nav-letter">$</span>
          <span>Precio Detal</span>
        </button>

        <button
          type="button"
          className={
            menuActivo === "tasa-cambio"
              ? "nexo-nav-item is-active"
              : "nexo-nav-item"
          }
          title="Tasa Cambio"
          onClick={() =>
            abrirTipoDiferencia(
              "TASA_CAMBIO",
              "tasa-cambio",
            )
          }
        >
          <span className="nexo-nav-letter">T</span>
          <span>Tasa Cambio</span>
        </button>

        <button
          type="button"
          className={
            menuActivo === "categoria"
              ? "nexo-nav-item is-active"
              : "nexo-nav-item"
          }
          title="Categoría"
          onClick={() =>
            abrirTipoDiferencia(
              "CATEGORIA",
              "categoria",
            )
          }
        >
          <span className="nexo-nav-letter">C</span>
          <span>Categoría</span>
        </button>

        <button
          type="button"
          className={
            menuActivo === "precio-promocion"
              ? "nexo-nav-item is-active"
              : "nexo-nav-item"
          }
          title="Precio Promoción"
          onClick={() =>
            abrirTipoDiferencia(
              "PRECIO_PROMOCION",
              "precio-promocion",
            )
          }
        >
          <span className="nexo-nav-letter">P</span>
          <span>Precio Promoción</span>
        </button>

        <button
          type="button"
          className={
            menuActivo === "costo-inicial"
              ? "nexo-nav-item is-active"
              : "nexo-nav-item"
          }
          title="Costo Inicial"
          onClick={() =>
            abrirTipoDiferencia(
              "COSTO_INICIAL",
              "costo-inicial",
            )
          }
        >
          <span className="nexo-nav-letter">I</span>
          <span>Costo Inicial</span>
        </button>

        <button
          type="button"
          className={
            menuActivo === "costo-dolar"
              ? "nexo-nav-item is-active"
              : "nexo-nav-item"
          }
          title="Costo Dólar"
          onClick={() =>
            abrirTipoDiferencia(
              "COSTO_DOLAR",
              "costo-dolar",
            )
          }
        >
          <span className="nexo-nav-letter">D</span>
          <span>Costo Dólar</span>
        </button>

        {/* ==================================================== */}
        {/* CORRECCIONES                                         */}
        {/* ==================================================== */}

        <div className="nexo-sidebar-group">CORRECCIONES</div>

        <button
          type="button"
          className={
            menuActivo === "corregidos"
              ? "nexo-nav-item is-active"
              : "nexo-nav-item"
          }
          title="Corregidos"
          onClick={abrirCorregidos}
        >
          <span className="nexo-nav-icon">✓</span>
          <span>Corregidos</span>
        </button>

        <button
          type="button"
          className={
            menuActivo === "historial"
              ? "nexo-nav-item is-active"
              : "nexo-nav-item"
          }
          title="Historial"
          onClick={abrirHistorial}
        >
          <span className="nexo-nav-icon">↺</span>
          <span>Historial</span>
        </button>

        {/* ==================================================== */}
        {/* ADMINISTRACIÓN                                       */}
        {/* ==================================================== */}

        <div className="nexo-sidebar-group">ADMINISTRACIÓN</div>

        <button
          type="button"
          className={
            menuActivo === "inventarios"
              ? "nexo-nav-item is-active"
              : "nexo-nav-item"
          }
          title="Inventarios"
          onClick={() => setMenuActivo("inventarios")}
        >
          <span className="nexo-nav-icon">↑</span>
          <span>Inventarios</span>
        </button>

        <button
          type="button"
          className={
            menuActivo === "usuarios"
              ? "nexo-nav-item is-active"
              : "nexo-nav-item"
          }
          title="Usuarios"
          onClick={abrirUsuarios}
        >
          <span className="nexo-nav-icon">U</span>
          <span>Usuarios</span>
        </button>

        {/* ==================================================== */}
        {/* MI CUENTA                                            */}
        {/* ==================================================== */}

        <div className="nexo-sidebar-group">MI CUENTA</div>

        <button
          type="button"
          className={
            menuActivo === "perfil"
              ? "nexo-nav-item is-active"
              : "nexo-nav-item"
          }
          title="Mi perfil"
          onClick={abrirPerfil}
        >
          <span className="nexo-nav-icon">◉</span>
          <span>Mi perfil</span>
        </button>
      </nav>

      {/* ====================================================== */}
      {/* FOOTER SIDEBAR                                         */}
      {/* ====================================================== */}

      <div className="nexo-sidebar-footer">
        NEXO QA · Desarrollo
      </div>
    </aside>
  );
}
