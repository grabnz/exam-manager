// Professional stroke icon system powered by lucide-react (uniform strokeWidth 1.75)
import type { LucideProps } from 'lucide-react'
import {
  BookOpen, Calculator, FlaskConical, PenLine, Globe, Moon, Scale, Landmark,
  Map, Palette, Music, Activity, Users, User, GraduationCap, School, Calendar,
  FolderOpen, FileText, FileSpreadsheet, FileArchive, Presentation, Image,
  Download, Upload, Plus, Link2, LayoutGrid, SlidersHorizontal, KeyRound,
  LogOut, Shield, Lock, Unlock, Clock, Pencil, BarChart3, Megaphone,
  AlertTriangle, Menu, WifiOff, Trash2, ChevronLeft, ChevronRight,
  ArrowLeft, ArrowRight, Check, CheckCircle2, X, Table2, Search, Sparkles,
  Printer, Copy, Dices, Pin, PinOff, TrendingUp, TrendingDown, UserPlus,
  Command, Eye, EyeOff, Filter, Award, DoorOpen, RefreshCw, Settings,
  FolderKanban, ArrowUpDown, ArrowLeftRight, Info,
} from 'lucide-react'

const w = (Comp: React.ComponentType<LucideProps>) =>
  ({ strokeWidth = 1.75, ...props }: LucideProps) =>
    <Comp strokeWidth={strokeWidth} aria-hidden="true" {...props} />

// ── Subjects ──────────────────────────────────────────────────────────────────
export const BookOpenIcon   = w(BookOpen)
export const CalculatorIcon = w(Calculator)
export const FlaskIcon      = w(FlaskConical)
export const PenLineIcon    = w(PenLine)
export const GlobeIcon      = w(Globe)
export const CrescentIcon   = w(Moon)
export const ScaleIcon      = w(Scale)
export const LandmarkIcon   = w(Landmark)
export const MapIcon        = w(Map)
export const PaletteIcon    = w(Palette)
export const MusicIcon      = w(Music)
export const ActivityIcon   = w(Activity)

// ── Navigation & Domain ───────────────────────────────────────────────────────
export const UsersIcon         = w(Users)
export const UserIcon          = w(User)
export const UserPlusIcon      = w(UserPlus)
export const GraduationCapIcon = w(GraduationCap)
export const SchoolIcon        = w(School)
export const CalendarIcon      = w(Calendar)
export const FolderIcon        = w(FolderOpen)
export const FolderKanbanIcon  = w(FolderKanban)
export const ClockIcon         = w(Clock)
export const ShieldIcon        = w(Shield)
export const SettingsIcon      = w(Settings)
export const DoorOpenIcon      = w(DoorOpen)
export const AwardIcon         = w(Award)

// ── Files & Export ────────────────────────────────────────────────────────────
export const FileIcon            = w(FileText)
export const FileSpreadsheetIcon = w(FileSpreadsheet)
export const FileArchiveIcon     = w(FileArchive)
export const PresentationIcon    = w(Presentation)
export const ImageIcon           = w(Image)
export const SheetIcon           = w(Table2)
export const DownloadIcon        = w(Download)
export const UploadIcon          = w(Upload)
export const PrinterIcon         = w(Printer)

// ── Actions & Controls ────────────────────────────────────────────────────────
export const PlusIcon           = w(Plus)
export const LinkIcon           = w(Link2)
export const GridIcon           = w(LayoutGrid)
export const SlidersIcon        = w(SlidersHorizontal)
export const KeyIcon            = w(KeyRound)
export const LogOutIcon         = w(LogOut)
export const LockIcon           = w(Lock)
export const UnlockIcon         = w(Unlock)
export const EditIcon           = w(Pencil)
export const ChartIcon          = w(BarChart3)
export const MegaphoneIcon      = w(Megaphone)
export const AlertIcon          = w(AlertTriangle)
export const InfoIcon           = w(Info)
export const MenuIcon           = w(Menu)
export const WifiOffIcon        = w(WifiOff)
export const TrashIcon          = w(Trash2)
export const ChevronLeftIcon    = w(ChevronLeft)
export const ChevronRightIcon   = w(ChevronRight)
export const ArrowLeftIcon      = w(ArrowLeft)
export const ArrowRightIcon     = w(ArrowRight)
export const ArrowUpDownIcon    = w(ArrowUpDown)
export const ArrowLeftRightIcon = w(ArrowLeftRight)
export const CheckIcon          = w(Check)
export const CheckCircleIcon    = w(CheckCircle2)
export const XIcon              = w(X)
export const SearchIcon         = w(Search)
export const SparklesIcon       = w(Sparkles)
export const CopyIcon           = w(Copy)
export const DicesIcon          = w(Dices)
export const PinIcon            = w(Pin)
export const PinOffIcon         = w(PinOff)
export const TrendingUpIcon     = w(TrendingUp)
export const TrendingDownIcon   = w(TrendingDown)
export const CommandIcon        = w(Command)
export const EyeIcon            = w(Eye)
export const EyeOffIcon         = w(EyeOff)
export const FilterIcon         = w(Filter)
export const RefreshCwIcon      = w(RefreshCw)
