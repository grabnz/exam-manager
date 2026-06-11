// UI color sets per GridSection.color_key. The first three reproduce the
// legacy French grid exactly (custom prod/lecture/com colors in tailwind
// config); others cycle for new templates.

export interface UIPalette {
  hdrBg: string; dataBg: string; stBg: string; totalBg: string
  cardBg: string; cardBorder: string; accentText: string
  tabActive: string; tabInactive: string
  printBg: string
}

const PALETTES: Record<string, UIPalette> = {
  blue: {
    hdrBg: 'bg-prod-mid', dataBg: 'bg-prod-light', stBg: 'bg-[#DAEAF5]', totalBg: 'bg-[#BDD7EE]',
    cardBg: 'bg-blue-50', cardBorder: 'border-blue-200', accentText: 'text-blue-800',
    tabActive: 'bg-prod-dark text-white', tabInactive: 'bg-prod-light text-prod-dark hover:bg-prod-mid',
    printBg: 'bg-blue-50',
  },
  green: {
    hdrBg: 'bg-lecture-mid', dataBg: 'bg-lecture-light', stBg: 'bg-[#D9EAD3]', totalBg: 'bg-[#A9D18E]',
    cardBg: 'bg-green-50', cardBorder: 'border-green-200', accentText: 'text-green-800',
    tabActive: 'bg-lecture-dark text-white', tabInactive: 'bg-lecture-light text-lecture-dark hover:bg-lecture-mid',
    printBg: 'bg-green-50',
  },
  orange: {
    hdrBg: 'bg-com-mid', dataBg: 'bg-com-light', stBg: 'bg-[#FDE9D9]', totalBg: 'bg-[#F4B183]',
    cardBg: 'bg-orange-50', cardBorder: 'border-orange-200', accentText: 'text-orange-800',
    tabActive: 'bg-com-dark text-white', tabInactive: 'bg-com-light text-com-dark hover:bg-com-mid',
    printBg: 'bg-orange-50',
  },
  purple: {
    hdrBg: 'bg-purple-200', dataBg: 'bg-purple-50', stBg: 'bg-purple-100', totalBg: 'bg-purple-300',
    cardBg: 'bg-purple-50', cardBorder: 'border-purple-200', accentText: 'text-purple-800',
    tabActive: 'bg-purple-700 text-white', tabInactive: 'bg-purple-50 text-purple-800 hover:bg-purple-100',
    printBg: 'bg-purple-50',
  },
  teal: {
    hdrBg: 'bg-teal-200', dataBg: 'bg-teal-50', stBg: 'bg-teal-100', totalBg: 'bg-teal-300',
    cardBg: 'bg-teal-50', cardBorder: 'border-teal-200', accentText: 'text-teal-800',
    tabActive: 'bg-teal-700 text-white', tabInactive: 'bg-teal-50 text-teal-800 hover:bg-teal-100',
    printBg: 'bg-teal-50',
  },
  rose: {
    hdrBg: 'bg-rose-200', dataBg: 'bg-rose-50', stBg: 'bg-rose-100', totalBg: 'bg-rose-300',
    cardBg: 'bg-rose-50', cardBorder: 'border-rose-200', accentText: 'text-rose-800',
    tabActive: 'bg-rose-700 text-white', tabInactive: 'bg-rose-50 text-rose-800 hover:bg-rose-100',
    printBg: 'bg-rose-50',
  },
}

const CYCLE = Object.keys(PALETTES)

export function palette(colorKey: string | null | undefined, index: number): UIPalette {
  if (colorKey && PALETTES[colorKey]) return PALETTES[colorKey]
  return PALETTES[CYCLE[index % CYCLE.length]]
}
