import React from "react";
import {
  Home as HomeIcon,
  ShoppingCart as ShoppingCartIcon,
  Package as PackageIcon,
  DollarSign as DollarSignIcon,
  Users as UsersIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Sun as SunIcon,
  LogOut as LogOutIcon,
  Bug as BugIcon,
  X as XIcon,
  Moon as MoonIcon,
  FileText as FileTextIcon,
  BarChart3 as BarChart3Icon,
  Briefcase as BriefcaseIcon,
  Printer as PrinterIcon,
  Menu as MenuIcon,
  Info as InfoIcon,
  Activity as ActivityIcon,
  Plus as PlusIcon,
  Edit2 as Edit2Icon,
  Trash2 as Trash2Icon,
  Sparkles as SparklesIcon,
  Wrench as WrenchIcon,
  Palette as PaletteIcon,
  Zap as ZapIcon,
  Tags as TagsIcon,
  ArrowUpRight as ArrowUpRightIcon,
  ArrowDownRight as ArrowDownRightIcon,
  TrendingUp as TrendingUpIcon,
  Settings as SettingsIcon,
  ReceiptText as ReceiptTextIcon,
  ClipboardList as ClipboardListIcon,
  Boxes as BoxesIcon,
  CheckCircle as CheckCircleIcon,
  AlertTriangle as AlertTriangleIcon,
  Download as DownloadIcon,
  RefreshCw as RefreshCwIcon,
  Send as SendIcon,
  ShieldCheck as ShieldCheckIcon,
  Truck as TruckIcon,
} from "lucide-react";

export const UI_ICON_DEFAULTS = {
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const wrapIcon = (IconComponent) =>
  React.forwardRef(
    (
      {
        strokeWidth = UI_ICON_DEFAULTS.strokeWidth,
        strokeLinecap = UI_ICON_DEFAULTS.strokeLinecap,
        strokeLinejoin = UI_ICON_DEFAULTS.strokeLinejoin,
        ...props
      },
      ref,
    ) => (
      <IconComponent
        ref={ref}
        strokeWidth={strokeWidth}
        strokeLinecap={strokeLinecap}
        strokeLinejoin={strokeLinejoin}
        {...props}
      />
    ),
  );

const Icons = {
  Home: wrapIcon(HomeIcon),
  ShoppingCart: wrapIcon(ShoppingCartIcon),
  Package: wrapIcon(PackageIcon),
  DollarSign: wrapIcon(DollarSignIcon),
  Users: wrapIcon(UsersIcon),
  ChevronLeft: wrapIcon(ChevronLeftIcon),
  ChevronRight: wrapIcon(ChevronRightIcon),
  Sun: wrapIcon(SunIcon),
  LogOut: wrapIcon(LogOutIcon),
  Bug: wrapIcon(BugIcon),
  X: wrapIcon(XIcon),
  Moon: wrapIcon(MoonIcon),
  FileText: wrapIcon(FileTextIcon),
  BarChart3: wrapIcon(BarChart3Icon),
  Briefcase: wrapIcon(BriefcaseIcon),
  Printer: wrapIcon(PrinterIcon),
  Menu: wrapIcon(MenuIcon),
  Info: wrapIcon(InfoIcon),
  Activity: wrapIcon(ActivityIcon),
  Plus: wrapIcon(PlusIcon),
  Edit2: wrapIcon(Edit2Icon),
  Trash2: wrapIcon(Trash2Icon),
  Sparkles: wrapIcon(SparklesIcon),
  Wrench: wrapIcon(WrenchIcon),
  Palette: wrapIcon(PaletteIcon),
  Zap: wrapIcon(ZapIcon),
  Tags: wrapIcon(TagsIcon),
  ArrowUpRight: wrapIcon(ArrowUpRightIcon),
  ArrowDownRight: wrapIcon(ArrowDownRightIcon),
  TrendingUp: wrapIcon(TrendingUpIcon),
  Settings: wrapIcon(SettingsIcon),
  ReceiptText: wrapIcon(ReceiptTextIcon),
  ClipboardList: wrapIcon(ClipboardListIcon),
  Boxes: wrapIcon(BoxesIcon),
  CheckCircle: wrapIcon(CheckCircleIcon),
  AlertTriangle: wrapIcon(AlertTriangleIcon),
  Download: wrapIcon(DownloadIcon),
  RefreshCw: wrapIcon(RefreshCwIcon),
  Send: wrapIcon(SendIcon),
  ShieldCheck: wrapIcon(ShieldCheckIcon),
  Truck: wrapIcon(TruckIcon),
};

export default Icons;
