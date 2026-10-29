import { vaultPhotoMock } from "@tgcloud/ui/core/vaultPhotoMock";
import { vaultMock, mockVaultPermissions } from "@tgcloud/ui/core/vaultMock";
import { useTransfers } from "@tgcloud/ui/core/transfers";
/**
 * Simulated backend to develop the interface in the browser (`npm run dev`,
 * outside Tauri). Only loaded in DEV; it does not go into the app build.
 */
import type { Mock } from "@tgcloud/ui/core/server";
import type { Node } from "./api";

let seq = 100;
const now = Math.floor(Date.now() / 1000);
const day = 86400;

function node(id: number, parent_id: number, name: string, mime = "", size = 0, age = 0): Node {
  return { id, parent_id, name, is_dir: !mime, size, mime, created_at: now - age, modified_at: now - age, trashed_at: null, thumb: false, duration: null };
}

const nodes: Node[] = [
  node(1, 0, "Documentos", "", 0, 30 * day),
  node(2, 0, "Fotos", "", 0, 20 * day),
  node(3, 0, "Vídeos", "", 0, 10 * day),
  node(4, 1, "Contratos", "", 0, 9 * day),
  node(5, 2, "Viagem 2025", "", 0, 200 * day),
  node(10, 0, "relatorio-anual.pdf", "application/pdf", 2_481_331, 2 * day),
  node(11, 0, "backup-servidor.tar.gz", "application/gzip", 3_221_225_472, 5 * day),
  node(12, 0, "notas.md", "text/markdown", 4_210, 3600),
  node(13, 1, "proposta.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 182_004, 40 * day),
  node(14, 1, "planilha-custos.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 92_133, 12 * day),
  node(15, 2, "praia.jpg", "image/jpeg", 4_812_002, 6 * day),
  node(16, 2, "por-do-sol.png", "image/png", 9_120_442, 6 * day),
  node(21, 2, "montanha.jpg", "image/jpeg", 3_120_442, 7 * day),
  node(17, 3, "apresentacao.mp4", "video/mp4", 734_003_200, 1 * day),
  node(18, 3, "podcast-ep12.mp3", "audio/mpeg", 58_720_256, 4 * day),
  node(19, 4, "contrato-locacao.pdf", "application/pdf", 512_440, 300 * day),
  node(20, 0, "fontes.zip", "application/zip", 12_582_912, 400 * day),
];

type MockVault = { id: number; name: string; title: string; valid: boolean; unsupported: boolean; legacy: boolean; created_at: number | null; current: boolean };
const vaults: MockVault[] = [
  { id: 1, name: "Pessoal", title: "Pessoal.tgdrive", valid: true, unsupported: false, legacy: false, created_at: Date.now() - 40 * day * 1000, current: false },
  { id: 2, name: "Trabalho", title: "Trabalho.tgdrive", valid: true, unsupported: false, legacy: false, created_at: Date.now() - 12 * day * 1000, current: false },
  { id: 3, name: "Fotos antigas", title: "Fotos antigas.tgdrive", valid: false, unsupported: false, legacy: false, created_at: null, current: false },
  { id: 4, name: "TGDrive", title: "TGDrive", valid: false, unsupported: false, legacy: true, created_at: null, current: false },
].map(mockVaultPermissions);
let currentVault: MockVault | null = new URLSearchParams(location.search).has("novault") ? null : vaults[0];

const alive = (n: Node): boolean => {
  if (n.trashed_at) return false;
  if (n.parent_id === 0) return true;
  const p = nodes.find((x) => x.id === n.parent_id);
  return !!p && alive(p);
};
const touch = (n: Node) => (n.modified_at = Math.floor(Date.now() / 1000));
const descendants = (id: number): number[] => nodes.filter((n) => n.parent_id === id).flatMap((n) => [n.id, ...descendants(n.id)]);

type Args = Record<string, unknown>;

let mockTransfers = [
    { id: 1, kind: "down", state: "active", name: "apresentacao.mp4", size: 734_003_200, done: 301_000_000, src: "", dest: "/home/u/Downloads/apresentacao.mp4", parent_id: 0, mime: "video/mp4", error: null, created_at: Date.now(), updated_at: Date.now() },
    { id: 2, kind: "down", state: "queued", name: "backup-servidor.tar.gz", size: 3_221_225_472, done: 0, src: "", dest: "/home/u/Downloads/backup-servidor.tar.gz", parent_id: 0, mime: "application/gzip", error: null, created_at: Date.now(), updated_at: Date.now() },
    { id: 3, kind: "down", state: "done", name: "relatorio-anual.pdf", size: 2_481_331, done: 2_481_331, src: "", dest: "/home/u/Downloads/relatorio-anual.pdf", parent_id: 0, mime: "application/pdf", error: null, created_at: Date.now(), updated_at: Date.now() },
    { id: 4, kind: "down", state: "error", name: "fontes.zip", size: 12_582_912, done: 4_000_000, src: "", dest: "/home/u/Downloads/fontes.zip", parent_id: 0, mime: "application/zip", error: "o conteúdo baixado não confere com o original (sha256)", created_at: Date.now(), updated_at: Date.now() },
    { id: 5, kind: "up", state: "paused", name: "ferias-2026.mov", size: 5_368_709_120, done: 1_610_612_736, src: "/home/u/Videos/ferias-2026.mov", dest: "", parent_id: 0, mime: "video/quicktime", error: null, created_at: Date.now(), updated_at: Date.now() },
    { id: 6, kind: "up", state: "done", name: "notas.md", size: 4_210, done: 4_210, src: "/home/u/notas.md", dest: "", parent_id: 0, mime: "text/markdown", error: null, created_at: Date.now(), updated_at: Date.now() },
  ];
function changeTransfer(id: number, state: "paused" | "queued" | "canceled") {
  mockTransfers = mockTransfers.map(item => item.id === id ? {...item, state, error:null} : item);
  useTransfers.setState(s => ({list:s.list.map(item => item.id === id ? {...item,state,error:null} : item)}));
}
function removeTransfer(id: number) {
  mockTransfers = mockTransfers.filter(item => item.id !== id);
  useTransfers.setState(s => ({list:s.list.filter(item => item.id !== id)}));
}

const handlers: Record<string, (a: Args) => unknown> = {
  ...vaultMock("tgdrive"),
  peek_open: () => ({ items: Array.from({length: 24}, (_,i) => ({ uid: `preview-${i+1}`, name: `IMG_${i+1}.jpg`, mime: "image/jpeg", date: now - i * 86400, thumb: true })), albums: [{ uid: "preview-album", name: "Viagens", items: ["preview-1","preview-2","preview-3"] }] }),
  status: () => ({ authorized: true, port: 0, vault: currentVault }),
  sync_now: () => ({ pulled: 0, pushed: 0, compacted: false }),
  kick_sync: () => {},
  cached_vaults: () => [],
  transfers: () => mockTransfers,
  transfer_pause: a => changeTransfer(Number(a.id), "paused"),
  transfer_resume: a => changeTransfer(Number(a.id), "queued"),
  transfer_cancel: a => changeTransfer(Number(a.id), "canceled"),
  transfer_remove: a => removeTransfer(Number(a.id)),
  transfer_open: () => {},
  transfers_bulk: a => {
    for (const item of [...mockTransfers]) {
      if (a.kind && item.kind !== a.kind) continue;
      if (a.action === "clear" && ["done", "canceled"].includes(item.state)) removeTransfer(item.id);
      else if (a.action === "pause" && ["active", "queued", "waiting"].includes(item.state)) changeTransfer(item.id, "paused");
      else if (a.action === "resume" && ["paused", "error"].includes(item.state)) changeTransfer(item.id, "queued");
      else if (a.action === "cancel" && !["done", "canceled"].includes(item.state)) changeTransfer(item.id, "canceled");
    }
  },
  list_vaults: () => vaults.map((v) => ({ ...v, current: v.id === currentVault?.id })),
  create_vault: (a) => {
    const v = { id: ++seq, name: String(a.name), title: `${a.name}.tgdrive`, valid: true, unsupported: false, legacy: false, created_at: Date.now(), current: true };
    vaults.push(v);
    return (currentVault = v);
  },
  open_vault: (a) => (currentVault = vaults.find((v) => v.id === a.id) ?? null),
  convert_vault: (a) => {
    const v = vaults.find((x) => x.id === a.id)!;
    Object.assign(v, { valid: true, legacy: false, title: "TGDrive.tgdrive", created_at: Date.now() });
    return (currentVault = v);
  },
  close_vault: () => {
    currentVault = null;
  },
  list: (a) => nodes.filter((n) => n.parent_id === a.parent && !n.trashed_at),
  recent: () => nodes.filter((n) => !n.is_dir && alive(n)).sort((a, b) => b.modified_at - a.modified_at).slice(0, 100),
  trash_list: () => nodes.filter((n) => n.trashed_at),
  search: (a) => nodes.filter((n) => alive(n) && n.name.toLowerCase().includes(String(a.text).toLowerCase())),
  folders: () => nodes.filter((n) => n.is_dir && alive(n)),
  path: (a) => {
    const out: Node[] = [];
    let id = a.id as number;
    while (id) {
      const n = nodes.find((x) => x.id === id);
      if (!n) break;
      out.unshift(n);
      id = n.parent_id;
    }
    return out;
  },
  usage: () => {
    const files = nodes.filter((n) => !n.is_dir && alive(n));
    return { files: files.length, bytes: files.reduce((s, n) => s + n.size, 0) };
  },
  mkdir: (a) => {
    const n = node(++seq, a.parent as number, String(a.name));
    nodes.push(n);
    return n;
  },
  rename: (a) => {
    const n = nodes.find((x) => x.id === a.id)!;
    n.name = String(a.name);
    touch(n);
  },
  move_nodes: (a) => (a.ids as number[]).forEach((id) => (nodes.find((x) => x.id === id)!.parent_id = a.parent as number)),
  copy_nodes: (a) =>
    (a.ids as number[]).forEach((id) => {
      const src = nodes.find((x) => x.id === id)!;
      nodes.push({ ...src, id: ++seq, parent_id: a.parent as number });
    }),
  trash: (a) => (a.ids as number[]).forEach((id) => (nodes.find((x) => x.id === id)!.trashed_at = Math.floor(Date.now() / 1000))),
  restore: (a) => (a.ids as number[]).forEach((id) => (nodes.find((x) => x.id === id)!.trashed_at = null)),
  purge: (a) => {
    const doomed = new Set((a.ids as number[]).flatMap((id) => [id, ...descendants(id)]));
    for (let i = nodes.length - 1; i >= 0; i--) if (doomed.has(nodes[i].id)) nodes.splice(i, 1);
  },
  empty_trash: () => handlers.purge({ ids: nodes.filter((n) => n.trashed_at).map((n) => n.id) }),
  sign_out: () => {},
  vault_remember_key: (a) => {
    if (a.password !== "12345678") throw new Error("senha incorreta");
  },
  copy_to_vault: () => 1,
  vault_link: (a) => `https://t.me/+mock-vault-${a.id}`,
  delete_vault: () => {},
  local_link: () => {},
  copies: () => [],
  copies_clear: () => {},
  rename_vault: (a) => ({ id: a.id, name: String(a.name), title: `${a.name}`, valid: true, unsupported: false, legacy: false, created_at: Date.now(), current: false }),
  import_sources: () => [{ id: 7, name: "Família", title: "Família.tgphotos" }],
  import_browse: () => ({
    albums: [
      { uid: "a1", name: "Viagem", count: 3 },
      { uid: "a2", name: "Aniversário", count: 2 },
    ],
    media: Array.from({ length: 8 }, (_, i) => ({
      uid: `m${i}`,
      name: `IMG_2024010${i}_101500.jpg`,
      mime: "image/jpeg",
      size: 3_000_000 + i * 1000,
      taken: now - i * day,
      duration: null,
      albums: i < 3 ? ["a1"] : i < 5 ? ["a2"] : [],
    })),
  }),
  import_run: (a) => ({ imported: (a.uids as string[]).length, failed: 0 }),
};

export async function mockInvoke<T>(cmd: string, args: Args = {}): Promise<T> {
  await new Promise((r) => setTimeout(r, 120));
  const h = handlers[cmd];
  if (!h) throw new Error(`mock: comando ${cmd} não simulado`);
  return structuredClone(h(args)) as T;
}

/** Simulated upload: progress at ~8 MB/s and the node lands in the folder. */
export function mockUpload(file: File, parent: number, onProgress: (sent: number) => void) {
  let sent = 0;
  let stop = false;
  const promise = new Promise<Node>((resolve, reject) => {
    const tick = () => {
      if (stop) return reject(new Error("cancelado"));
      sent = Math.min(file.size, sent + 8 * 1024 * 1024 * 0.2);
      onProgress(sent);
      if (sent >= file.size) {
        const n = node(++seq, parent, file.name, file.type || "application/octet-stream", file.size);
        nodes.push(n);
        resolve(n);
      } else setTimeout(tick, 200);
    };
    setTimeout(tick, 200);
  });
  return { promise, abort: () => (stop = true) };
}

/** Sample image (SVG) for simulated media. */
export function mockFileUrl(id: number) {
  const n = nodes.find((x) => x.id === id);
  const hue = (id * 67) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1067"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},70%,55%)"/><stop offset="1" stop-color="hsl(${(hue + 80) % 360},70%,25%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="1150" cy="330" r="160" fill="rgba(255,255,255,.35)"/><text x="80" y="980" font-family="sans-serif" font-size="64" fill="white">${n?.name ?? id}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const mock: Mock = {
  ...vaultPhotoMock(() => vaults, mockFileUrl),
  invoke: mockInvoke,
  fileUrl: mockFileUrl,
  upload: <T,>(file: File, params: Record<string, string>, onProgress: (sent: number) => void) => {
    const { promise, abort } = mockUpload(file, Number(params.parent ?? 0), onProgress);
    return { promise: promise as Promise<T>, abort };
  },
};
