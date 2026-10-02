import { STORAGE_KEYS, readJson, readArray, writeJson, remove } from "./storage-service.js";

export const MIN_PASSWORD_LENGTH = 8;
const ITERATIONS = 120000;
const publicUser = ({ id, name, email }) => ({ id, name, email });
const normalizedEmail = (value) => String(value ?? "").trim().toLowerCase();

function validateProfile({ name, email }) {
  if (!name?.trim() || name.trim().length > 40) throw new Error("이름은 1~40자로 입력하세요.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("올바른 이메일을 입력하세요.");
}

function validatePassword(password, confirmation) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH || password.length > 128) {
    throw new Error("비밀번호는 8~128자로 입력하세요.");
  }
  if (password !== confirmation) throw new Error("비밀번호 확인이 일치하지 않습니다.");
}

async function hashPassword(password, salt) {
  if (!globalThis.crypto?.subtle) throw new Error("회원 기능은 localhost 또는 HTTPS에서 이용하세요.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bytes = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: ITERATIONS, hash: "SHA-256" }, key, 256);
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function passwordFields(password) {
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { passwordSalt: salt, passwordHash: await hashPassword(password, salt) };
}

async function matchesPassword(user, password) {
  if (user.passwordHash) return await hashPassword(password, user.passwordSalt) === user.passwordHash;
  return typeof user.password === "string" && user.password === password; // starter data migration
}

export function notifyAuthChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("authchange"));
}

export function getUsers() {
  return readArray(STORAGE_KEYS.USERS);
}

export function getCurrentUser() {
  const session = readJson(STORAGE_KEYS.CURRENT_USER, null);
  const user = session?.id && getUsers().find((item) => item.id === session.id);
  return user ? publicUser(user) : null;
}

export function requireUser() {
  const user = getCurrentUser();
  if (!user) throw new Error("로그인 후 이용할 수 있습니다.");
  return user;
}

export async function registerUser(user) {
  const id = String(user.id ?? "").trim();
  const name = String(user.name ?? "").trim();
  const email = normalizedEmail(user.email);
  if (!/^[a-zA-Z0-9_-]{3,30}$/.test(id)) throw new Error("아이디는 영문, 숫자, 밑줄, 하이픈으로 3~30자 입력하세요.");
  validateProfile({ name, email });
  validatePassword(user.password, user.passwordConfirm);
  if (getUsers().some((item) => item.id === id)) throw new Error("이미 사용 중인 아이디입니다.");
  const credentials = await passwordFields(user.password);
  const users = getUsers(); // re-read after the async hash to prevent duplicate submits
  if (users.some((item) => item.id === id)) throw new Error("이미 사용 중인 아이디입니다.");
  const record = { id, name, email, ...credentials };

  users.push(record);
  writeJson(STORAGE_KEYS.USERS, users);
  return publicUser(record);
}

export async function login(id, password) {
  const user = getUsers().find((item) => item.id === String(id).trim());
  if (!user || !(await matchesPassword(user, password))) {
    throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
  }

  if (!user.passwordHash) {
    const credentials = await passwordFields(password);
    const users = getUsers();
    const index = users.findIndex((item) => item.id === user.id && item.password === password);
    if (index < 0) throw new Error("회원정보가 변경되었습니다. 다시 로그인하세요.");
    users[index] = { ...publicUser(user), ...credentials };
    writeJson(STORAGE_KEYS.USERS, users);
  }
  writeJson(STORAGE_KEYS.CURRENT_USER, { id: user.id });
  notifyAuthChange();
  return publicUser(user);
}

export function logout() {
  remove(STORAGE_KEYS.CURRENT_USER);
  notifyAuthChange();
}

export async function updateCurrentUser(patch) {
  const current = requireUser();
  const name = String(patch.name ?? "").trim();
  const email = normalizedEmail(patch.email);
  validateProfile({ name, email });
  let credentials = {};
  if (patch.password) {
    validatePassword(patch.password, patch.passwordConfirm);
    const record = getUsers().find((item) => item.id === current.id);
    if (!(await matchesPassword(record, patch.currentPassword))) throw new Error("현재 비밀번호가 올바르지 않습니다.");
    credentials = await passwordFields(patch.password);
  }
  if (requireUser().id !== current.id) throw new Error("로그인 계정이 변경되었습니다. 다시 시도하세요.");
  const users = getUsers();
  const index = users.findIndex((item) => item.id === current.id);
  if (index < 0) throw new Error("회원 정보를 찾을 수 없습니다.");

  users[index] = { ...users[index], name, email, ...credentials };
  if (credentials.passwordHash) delete users[index].password;
  writeJson(STORAGE_KEYS.USERS, users);
  notifyAuthChange();
  return publicUser(users[index]);
}

export function verifyRecovery(id, email) {
  const user = getUsers().find((item) => item.id === id.trim() && item.email.toLowerCase() === normalizedEmail(email));
  if (!user) throw new Error("아이디와 이메일이 일치하는 회원을 찾을 수 없습니다.");
  return true;
}

export async function resetPassword({ id, email, password, passwordConfirm }) {
  verifyRecovery(id, email);
  validatePassword(password, passwordConfirm);
  const credentials = await passwordFields(password);
  verifyRecovery(id, email);
  const users = getUsers();
  const index = users.findIndex((user) => user.id === id.trim());
  users[index] = { ...publicUser(users[index]), ...credentials };
  writeJson(STORAGE_KEYS.USERS, users);
  if (getCurrentUser()?.id === id.trim()) logout();
}

export function deleteCurrentUser() {
  const current = requireUser();

  // Delete only this member's records; keep other members and legacy unowned data.
  for (const key of [STORAGE_KEYS.PLANS, STORAGE_KEYS.HOTPLACES, STORAGE_KEYS.DRAFTS, STORAGE_KEYS.VISITS]) {
    writeJson(key, readArray(key).filter((item) => item.ownerId !== current.id));
  }

  const users = getUsers().filter((item) => item.id !== current.id);
  writeJson(STORAGE_KEYS.USERS, users);
  logout();
}
