/**
 * Normaliza la consulta igual que el buscador del cliente.
 * Las reglas se compilan una vez: la búsqueda no reconstruye regex por producto.
 */

export function foldSearchText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/(\d+)\s*(tb|gb|mb|ghz|mhz|w)\b/g, "$1$2")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactCode(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

type PhraseRule = { phrase: string; replacement: string };

const WORD_FIXES: Record<string, string[]> = {
  tarjeta: ["tarjetas", "targeta", "targetas", "tarjets", "tarjta", "tarje", "tarjet"],
  memoria: ["memorias", "memori", "memory", "memoris", "mem", "memo"],
  gabinete: ["gabinetes", "gabinet", "gabo", "gavinetes", "gavinete"],
  audifono: ["audifonos", "audiculares", "auriculares", "auricular", "audifno"],
  teclado: ["teclados", "teclao", "teclad"],
  mouse: ["mouses", "mause", "ratones", "raton"],
  monitor: ["monitores", "monitors"],
  procesador: ["procesadores", "proce", "processador"],
};

const SYNONYMS: Record<string, string[]> = {
  procesador: ["cpu", "microprocesador", "processor", "processors"],
  motherboard: [
    "tarjeta madre",
    "placa base",
    "placas base",
    "motherboards",
    "mobo",
    "mainboard",
    "tarjeta principal",
    "moterboard",
    "mother",
  ],
  "tarjeta de video": [
    "tarjeta grafica",
    "grafica",
    "graficas",
    "gpu",
    "gpus",
    "video card",
    "graphics card",
    "tarjeta de graficos",
  ],
  "memoria ram": ["memoria ram", "ram", "modulos ram"],
  "disco duro": [
    "disco duro",
    "hdd",
    "hard drive",
    "disco mecanico",
    "discos",
    "disco",
  ],
  "estado solido": [
    "ssd",
    "solid state",
    "unidad de estado solido",
    "unidades de estado solido",
    "nvme",
    "m.2",
    "m2",
    "m 2",
  ],
  gabinete: ["case", "cases", "chasis", "torre", "torres", "caja"],
  "fuente de poder": [
    "fuente de poder",
    "power supply",
    "psu",
    "fuente",
    "fuentes",
    "fuente de alimentacion",
    "fuentes de alimentacion",
  ],
  enfriamiento: [
    "refrigeracion",
    "refrigeracion liquida",
    "enfriamiento liquido",
    "cooler",
    "coolers",
    "ventilador",
    "ventiladores",
    "disipador",
    "disipadores",
    "fan",
    "fans",
    "aio",
    "heatsink",
    "pasta termica",
    "thermal paste",
  ],
  audifono: ["headset", "headsets", "headphones", "diadema", "cascos"],
  teclado: ["keyboard", "keyboards", "teclado gamer"],
  mouse: ["mice", "mouse gamer"],
  monitor: ["pantalla", "pantallas", "display", "displays"],
  bocina: [
    "bocinas",
    "parlante",
    "parlantes",
    "altavoz",
    "altavoces",
    "speaker",
    "speakers",
    "audio",
  ],
  microfono: ["microfonos", "mic", "microphone"],
  camara: ["camaras", "camara web", "webcam", "webcams"],
  impresora: ["impresoras", "printer", "printers", "multifuncional", "multifuncionales"],
  silla: ["sillas", "chair", "chairs", "sillon", "silla gamer", "sillas gamer"],
  escritorio: ["escritorios", "mesa", "mesas", "desk", "desks", "escritorio gamer"],
  laptop: ["laptops", "notebook", "notebooks", "portatil", "portatiles", "lap"],
  pc: [
    "computadora",
    "computadoras",
    "ordenador",
    "ordenadores",
    "computador",
    "desktop",
    "pc armada",
    "pc gamer",
    "compu",
  ],
  usb: ["memoria usb", "pendrive", "flash drive", "usb drive", "pen drive"],
  cable: ["cables", "cableado"],
  adaptador: ["adaptadores", "convertidor", "convertidores", "dongle"],
  router: [
    "routers",
    "enrutador",
    "modem",
    "modems",
    "punto de acceso",
    "access point",
    "ap",
  ],
  wifi: ["wi-fi", "wi fi", "wireless", "inalambrico", "inalambrica"],
  "tarjeta de red": ["tarjeta de red", "network card", "adaptador de red"],
  software: ["programa", "programas", "sistema operativo", "os"],
  windows: ["win", "win10", "win11", "windows 10", "windows 11"],
  antivirus: ["anti virus", "seguridad"],
};

function compileRules(groups: Record<string, string[]>[]): PhraseRule[] {
  const rules: PhraseRule[] = [];
  for (const group of groups) {
    for (const [target, variants] of Object.entries(group)) {
      const replacement = foldSearchText(target);
      if (!replacement) continue;
      for (const variant of variants) {
        const phrase = foldSearchText(variant);
        if (!phrase || phrase === replacement) continue;
        rules.push({ phrase, replacement });
      }
    }
  }
  rules.sort((a, b) => b.phrase.length - a.phrase.length);
  return rules;
}

const RULES = compileRules([WORD_FIXES, SYNONYMS]);

function isWordChar(char: string | undefined): boolean {
  return Boolean(char && /[a-z0-9]/.test(char));
}

function applyRules(text: string): string {
  let out = "";
  let index = 0;
  while (index < text.length) {
    let matched = false;
    for (const rule of RULES) {
      if (!text.startsWith(rule.phrase, index)) continue;
      const before = index === 0 ? " " : text[index - 1];
      const after = text[index + rule.phrase.length];
      if (isWordChar(before) || isWordChar(after)) continue;

      // "memoria ram" ya trae la frase canónica: no volver a expandir "ram".
      if (rule.replacement.endsWith(rule.phrase)) {
        const head = rule.replacement.slice(0, -rule.phrase.length);
        if (head && out.endsWith(head)) {
          out += rule.phrase;
          index += rule.phrase.length;
          matched = true;
          break;
        }
      }

      out += rule.replacement;
      index += rule.phrase.length;
      matched = true;
      break;
    }
    if (!matched) {
      out += text[index] ?? "";
      index += 1;
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Consulta lista para partir en tokens. Idempotente si el cliente ya la normalizó. */
export function normalizeSearchTerm(term: unknown): string {
  const folded = foldSearchText(term);
  if (!folded) return "";
  return applyRules(folded);
}
