import { ContractError, object, text } from "../../../../packages/contracts/validation.mjs";

export function parseEmail(value) {
  const email = text(value, "email", 254).toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(email)) {
    throw new ContractError("Email tidak valid.", { email: "Isi alamat email yang valid." });
  }
  return email;
}

export function parseRegistration(body) {
  object(body, ["name", "email", "password"]);
  const name = text(body.name, "name", 60), email = parseEmail(body.email);
  if (name.includes("\0")) {
    throw new ContractError("Nama tidak valid.", { name: "Isi nama tanpa karakter NUL." });
  }
  return { name, email, password: text(body.password, "password", 128, { min: 8, trim: false }) };
}
