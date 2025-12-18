import type { Entry } from "./db";


export interface Game extends Entry {
  name: string;
  batPath: string;
  image: string;
}

export interface App {
  name: string;
  batPath: string;
  icon: string;
}

let games: Game[] = [
  {
    name: "Sekiro Automata",
    batPath: "C:/Games/genshin.bat",
    image: "/images/genshin.jpg",
  },

  {
    name: "Sekiro",
    batPath: "C:/Games/eldenring.bat",
    image: "/images/eldenring.jpg",
  },

  {
    name: "Dark Souls 3",
    batPath: "C:/Games/genshin.bat",
    image: "/images/genshin.jpg",
  },

  {
    name: "Elden Ring",
    batPath: "C:/Games/genshin.bat",
    image: "/images/genshin.jpg",
  },

  {
    name: "Elden Ring: Nightrein",
    batPath: "C:/Games/genshin.bat",
    image: "/images/genshin.jpg",
  },

  {
    name: "Monster Hunter World",
    batPath: "/scripts/launch_mhw.bat",
    image: "/images/mhw.png",
  },

  {
    name: "Monster Hunter Rise",
    batPath: "/scripts/launch_mhr.bat",
    image: "/images/monster_rise.jpg",
  },

  {
    name: "Wild Hearts",
    batPath: "/scripts/launch_mhwib.bat",
    image: "/images/wild_hearts.png",
  },

  {
    name: "Wuthering Waves",
    batPath: "/scripts/launch_wuwa.bat",
    image: "/images/wuwa.png",
  },

  {
    name: "Duet Night Abyss",
    batPath:
      "C:/Users/arman/Documents/Projects/k-scope/static/scripts/launch_dna.bat",
    image: "/images/dna.jpg",
  },
];

let apps: App[] = [
  {
    name: "Wiztree",
    batPath:
      "C:/Users/arman/Documents/Projects/k-scope/static/scripts/launch_wiztree.bat",
    icon: "/icons/wiztree.png",
  },
  {
    name: "Prism",
    batPath:
      "C:/Users/arman/Documents/Projects/k-scope/static/scripts/launch_prism.bat",
    icon: "/icons/prism.png",
  },
];

export { games, apps };