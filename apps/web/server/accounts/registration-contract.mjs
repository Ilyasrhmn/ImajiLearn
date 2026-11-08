import { ContractError, object, text } from "../../../../packages/contracts/validation.mjs";

export function parseRegistration(body) {
  object(body, ["name", "email", "password"]);
  const name = text(body.name, "name", 60), email = text(body.email, "email", 254).toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(email)) {
    throw new ContractError("Email tidak valid.", { email: "Isi alamat email yang valid." });
  }
  return { name, email, password: text(body.password, "password", 128, { min: 8, trim: false }) };
}
