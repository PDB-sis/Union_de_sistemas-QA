import {test} from "node:test";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {hashPassword,verifyPassword,passwordSchema} from "../../backend/src/auth/password.ts";
import {initialUsers} from "../../backend/src/auth/provisioning.ts";
import {authConfig,requireOrigin,sessionCookie,requestToken} from "../../backend/src/auth/http.ts";

test("scrypt usa sal aleatoria y rechaza claves incorrectas o formatos inseguros",async()=>{
  const password=randomBytes(24).toString("base64url");
  const a=await hashPassword(password),b=await hashPassword(password);
  assert.notEqual(a,b);assert.equal(a.includes(password),false);
  assert.equal(await verifyPassword(password,a),true);
  assert.equal(await verifyPassword(randomBytes(24).toString("base64url"),a),false);
  assert.equal(await verifyPassword(password,null),false);
  assert.equal(passwordSchema.safeParse("").success,false);
  assert.equal(passwordSchema.safeParse("a".repeat(129)).success,false);
});
test("seed rechaza configuración parcial, correos repetidos y ausencia de cuentas",()=>{
  assert.throws(()=>initialUsers({}));
  assert.throws(()=>initialUsers({PDMC_SEED_ADMINISTRADOR_EMAIL:"admin@example.test"}));
  const password=randomBytes(24).toString("base64url");
  assert.throws(()=>initialUsers({PDMC_SEED_ADMINISTRADOR_EMAIL:"ADMIN@example.test",PDMC_SEED_ADMINISTRADOR_PASSWORD:password,PDMC_SEED_TIENDA_EMAIL:"admin@example.test",PDMC_SEED_TIENDA_PASSWORD:password}));
});
test("cookie segura, origen fijo y rechazo de HTTP en red",()=>{
  const before=process.env.PDMC_AUTH_ORIGIN;
  const beforeAdditional=process.env.PDMC_AUTH_ADDITIONAL_ORIGINS;
  try {
    process.env.PDMC_AUTH_ORIGIN="https://pdmc.example.test";
    process.env.PDMC_AUTH_ADDITIONAL_ORIGINS="https://tailnet.example.test:3000";
    assert.match(sessionCookie("",0),/^__Host-pdmc-session=; Path=\/; HttpOnly; SameSite=Lax; Max-Age=0; Secure$/);
    assert.throws(()=>requireOrigin(new Request("https://pdmc.example.test/api/auth/login",{method:"POST",headers:{origin:"https://other.test"}})),{status:403});
    assert.doesNotThrow(()=>requireOrigin(new Request("https://tailnet.example.test:3000/api/admin/usuarios",{method:"POST",headers:{origin:"https://tailnet.example.test:3000","sec-fetch-site":"same-origin"}})));
    assert.throws(()=>requireOrigin(new Request("https://tailnet.example.test:3000/api/admin/usuarios",{method:"POST",headers:{origin:"https://other.test","sec-fetch-site":"cross-site"}})),{status:403});
    assert.equal(requestToken(new Request("https://pdmc.example.test",{headers:{cookie:"__Host-pdmc-session=one; __Host-pdmc-session=two"}})),undefined);
    process.env.PDMC_AUTH_ORIGIN="http://192.168.0.142:3000";
    assert.throws(()=>authConfig(),{status:503});
  } finally {if(before===undefined)delete process.env.PDMC_AUTH_ORIGIN;else process.env.PDMC_AUTH_ORIGIN=before;if(beforeAdditional===undefined)delete process.env.PDMC_AUTH_ADDITIONAL_ORIGINS;else process.env.PDMC_AUTH_ADDITIONAL_ORIGINS=beforeAdditional;}
});
