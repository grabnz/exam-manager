// Stroke icon set (Lucide-style) — consistent 24px grid, currentColor.
import { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

function Svg({ children, ...props }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  )
}

// ── Subjects ──────────────────────────────────────────────────────────────────
export const BookOpenIcon = (p: P) => (
  <Svg {...p}><path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" /><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" /></Svg>
)
export const CalculatorIcon = (p: P) => (
  <Svg {...p}><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M9 6.5h6" /><path d="M9 11h.01M12 11h.01M15 11h.01M9 14.5h.01M12 14.5h.01M15 14.5h.01M9 18h.01M12 18h.01M15 18h.01" /></Svg>
)
export const FlaskIcon = (p: P) => (
  <Svg {...p}><path d="M10 2v6.3L4.6 17.8A2 2 0 0 0 6.4 21h11.2a2 2 0 0 0 1.8-3.2L14 8.3V2" /><path d="M8.5 2h7" /><path d="M7.3 15h9.4" /></Svg>
)
export const PenLineIcon = (p: P) => (
  <Svg {...p}><path d="M12 20h9" /><path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></Svg>
)
export const GlobeIcon = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></Svg>
)
export const CrescentIcon = (p: P) => (
  <Svg {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></Svg>
)
export const ScaleIcon = (p: P) => (
  <Svg {...p}><path d="M12 3v15" /><path d="M8 21h8" /><path d="M3 7h18" /><path d="m6 7-3 6a3.2 3.2 0 0 0 6 0L6 7Z" /><path d="m18 7-3 6a3.2 3.2 0 0 0 6 0l-3-6Z" /></Svg>
)
export const LandmarkIcon = (p: P) => (
  <Svg {...p}><path d="M3 21h18" /><path d="M5 17v-7" /><path d="M9.5 17v-7" /><path d="M14.5 17v-7" /><path d="M19 17v-7" /><path d="m12 2 9 5H3l9-5Z" /></Svg>
)
export const MapIcon = (p: P) => (
  <Svg {...p}><path d="m9 3-5 2v16l5-2 6 2 5-2V3l-5 2-6-2Z" /><path d="M9 3v16" /><path d="M15 5v16" /></Svg>
)
export const PaletteIcon = (p: P) => (
  <Svg {...p}><path d="M12 2a10 10 0 0 0 0 20 1.8 1.8 0 0 0 1.8-1.8 2 2 0 0 1 2-2h1.7A4.5 4.5 0 0 0 22 13.7C22 7.3 17.5 2 12 2Z" /><path d="M7 10h.01M11 6.5h.01M16 7.5h.01M6.5 14.5h.01" /></Svg>
)
export const MusicIcon = (p: P) => (
  <Svg {...p}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></Svg>
)
export const ActivityIcon = (p: P) => (
  <Svg {...p}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></Svg>
)

// ── UI ────────────────────────────────────────────────────────────────────────
export const UsersIcon = (p: P) => (
  <Svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></Svg>
)
export const UserIcon = (p: P) => (
  <Svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Svg>
)
export const GraduationCapIcon = (p: P) => (
  <Svg {...p}><path d="m22 9-10-5L2 9l10 5 10-5Z" /><path d="M6 11.5V16c3.5 3 8.5 3 12 0v-4.5" /><path d="M22 9v6" /></Svg>
)
export const SchoolIcon = (p: P) => (
  <Svg {...p}><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-4a3 3 0 0 1 6 0v4" /><path d="M9 10h.01M15 10h.01" /></Svg>
)
export const CalendarIcon = (p: P) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="17" rx="2.5" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></Svg>
)
export const FolderIcon = (p: P) => (
  <Svg {...p}><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.2 3.9A2 2 0 0 0 7.5 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></Svg>
)
export const FileIcon = (p: P) => (
  <Svg {...p}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2Z" /><path d="M14 2v6h6" /></Svg>
)
export const DownloadIcon = (p: P) => (
  <Svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></Svg>
)
export const UploadIcon = (p: P) => (
  <Svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 8 5-5 5 5" /><path d="M12 3v12" /></Svg>
)
export const PlusIcon = (p: P) => (
  <Svg {...p}><path d="M12 5v14" /><path d="M5 12h14" /></Svg>
)
export const LinkIcon = (p: P) => (
  <Svg {...p}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></Svg>
)
export const GridIcon = (p: P) => (
  <Svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></Svg>
)
export const SlidersIcon = (p: P) => (
  <Svg {...p}><path d="M4 21v-7" /><path d="M4 10V3" /><path d="M12 21v-9" /><path d="M12 8V3" /><path d="M20 21v-5" /><path d="M20 12V3" /><path d="M2 14h4" /><path d="M10 8h4" /><path d="M18 16h4" /></Svg>
)
export const KeyIcon = (p: P) => (
  <Svg {...p}><circle cx="7.5" cy="15.5" r="4" /><path d="m21 2-9.6 9.6" /><path d="m15.5 7.5 3 3L22 7l-3-3" /></Svg>
)
export const LogOutIcon = (p: P) => (
  <Svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></Svg>
)
export const ShieldIcon = (p: P) => (
  <Svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /></Svg>
)
export const LockIcon = (p: P) => (
  <Svg {...p}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Svg>
)
export const UnlockIcon = (p: P) => (
  <Svg {...p}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.9-.9" /></Svg>
)
export const ClockIcon = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></Svg>
)
export const EditIcon = (p: P) => (
  <Svg {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z" /></Svg>
)
export const ChartIcon = (p: P) => (
  <Svg {...p}><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></Svg>
)
export const MegaphoneIcon = (p: P) => (
  <Svg {...p}><path d="m3 11 18-6v12L3 13v-2Z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></Svg>
)
export const AlertIcon = (p: P) => (
  <Svg {...p}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></Svg>
)
export const MenuIcon = (p: P) => (
  <Svg {...p}><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></Svg>
)
export const WifiOffIcon = (p: P) => (
  <Svg {...p}><path d="M5 12.5a11 11 0 0 1 5.2-2.9" /><path d="M15 9.9a11 11 0 0 1 4 2.6" /><path d="M8.5 16.1a6 6 0 0 1 7 0" /><path d="M12 20h.01" /><path d="m2 2 20 20" /></Svg>
)
export const TrashIcon = (p: P) => (
  <Svg {...p}><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></Svg>
)
export const ChevronLeftIcon = (p: P) => (
  <Svg {...p}><path d="m15 18-6-6 6-6" /></Svg>
)
export const ChevronRightIcon = (p: P) => (
  <Svg {...p}><path d="m9 18 6-6-6-6" /></Svg>
)
export const ArrowLeftIcon = (p: P) => (
  <Svg {...p}><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></Svg>
)
export const CheckIcon = (p: P) => (
  <Svg {...p}><path d="M20 6 9 17l-5-5" /></Svg>
)
export const XIcon = (p: P) => (
  <Svg {...p}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Svg>
)
export const ImageIcon = (p: P) => (
  <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="2.5" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></Svg>
)
export const SheetIcon = (p: P) => (
  <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" /></Svg>
)
