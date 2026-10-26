// Regla del proyecto: SQL Server solo se lee. Esta validación se aplica antes
// de enviar cualquier consulta, porque el usuario configurado podría tener
// permisos de escritura (por ejemplo, sa).

// Palabras que solo aparecen en sentencias que escriben o ejecutan código.
const WRITE_KEYWORDS = /\b(insert|update|delete|merge|truncate|drop|alter|create|exec|execute|grant|revoke|deny|backup|restore|dbcc|shutdown|kill|openrowset|opendatasource|openquery|bulk|into|waitfor)\b/i;

/** Quita comentarios, textos entre comillas e identificadores entre corchetes. */
function statementText(text: string) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\r\n]*/g, " ")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/\[[^\]]*\]/g, "[]");
}

export function assertReadOnlyQuery(text: string) {
  const statements = statementText(text).trim();
  if (!/^(with|select)\b/i.test(statements)) throw new Error("La consulta debe empezar con SELECT o WITH: SQL Server solo se lee.");
  const forbidden = statements.match(WRITE_KEYWORDS);
  if (forbidden) throw new Error("La consulta contiene \"" + forbidden[1].toUpperCase() + "\": SQL Server solo se lee.");
  if (/;\s*\S/.test(statements)) throw new Error("La consulta debe tener una sola instruccion.");
}
