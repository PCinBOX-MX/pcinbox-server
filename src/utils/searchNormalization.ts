/**
 * Normalización alineada con pcinbox-client (`searchNormalization.ts`)
 * y el scoring de `searchProductInput` en server-proveedores.
 */
export function normalizeSearchTerm(term: string | undefined | null): string {
  if (!term) return "";

  let normalized = term
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  normalized = normalized.replace(/(\d+)\s*(tb|gb|mb|ghz|mhz|w)\b/g, "$1$2");

  const wordFixes: Record<string, string[]> = {
    tarjeta: ["tarjetas", "targeta", "targetas", "tarjets", "tarjta", "tarje", "tarjet"],
    memoria: ["memorias", "memori", "memory", "memoris", "mem", "memo"],
    gabinete: ["gabinetes", "gabinet", "gabo", "gavinetes", "gavinete"],
    audifono: ["audifonos", "audiculares", "auriculares", "auricular", "audifno"],
    teclado: ["teclados", "teclao", "teclad"],
    mouse: ["mouses", "mause", "ratones", "raton"],
    monitor: ["monitores", "monitors"],
    procesador: ["procesadores", "proce", "processador"],
  };

  for (const [correctWord, typos] of Object.entries(wordFixes)) {
    for (const typo of typos) {
      const regex = new RegExp(`\\b${typo}\\b`, "gi");
      if (regex.test(normalized)) {
        normalized = normalized.replace(regex, correctWord);
      }
    }
  }

  const synonyms: Record<string, string[]> = {
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
      "disco rigido",
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
    gabinete: ["case", "cases", "chasis", "torre", "torres", "caja", "cpu (gabinete)"],
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

  for (const [target, variations] of Object.entries(synonyms)) {
    for (const variant of variations) {
      const regex = new RegExp(`\\b${variant}\\b`, "gi");
      if (regex.test(normalized)) {
        normalized = normalized.replace(regex, target);
      }
    }
  }

  return normalized.replace(/\s+/g, " ").trim();
}

/** Compacta texto para matching (acentos, signos, espacios). */
export function normalizeMatchText(textProp: unknown): string {
  return String(textProp ?? "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
}
