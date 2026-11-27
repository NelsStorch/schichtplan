export { cn } from './utils/cn';
export { isAppleMobile, isPushSupported, isStandaloneDisplay } from './utils/device';

export {
  accentVars,
  applyAccent,
  contrastRatio,
  hexToRgb,
  rgbToHex,
  evaluateContrast,
  darkenToContrast,
  type ContrastEvaluation,
  type Rgb,
} from './theme/accent';
export { ThemeScript, THEME_STORAGE_KEY } from './theme/ThemeScript';
export { ThemeToggle } from './theme/ThemeToggle';

export { Button, buttonClasses, type ButtonProps, type ButtonSize, type ButtonVariant } from './components/Button';
export { Badge, type BadgeProps, type BadgeTone } from './components/Badge';
export { Chip, ChipRow, type ChipProps } from './components/Chip';
export { Card, type CardProps } from './components/Card';
export { Field, Input, Select, Switch, Textarea, type FieldProps, type SwitchProps } from './components/Field';
export { PasswordInput, type PasswordInputProps } from './components/PasswordInput';
export { Dialog, type DialogProps } from './components/Dialog';
export { SkipLink } from './components/SkipLink';
export {
  Callout,
  FeedbackProvider,
  useConfirm,
  useToast,
  type ConfirmOptions,
  type ToastInput,
  type ToastTone,
} from './components/Feedback';
export {
  Avatar,
  EmptyState,
  ProgressRing,
  Skeleton,
  SlotMeter,
  initials,
  slotStatus,
  type ProgressRingProps,
  type SlotStatus,
} from './components/Display';
export { PageLoader, Spinner, type PageLoaderProps, type SpinnerSize } from './components/Loading';
export { AppVersion, type AppVersionProps } from './components/AppVersion';
export { BrandLogo, CeviLogo } from './components/BrandLogo';
export { OrganizationProvider, useOrganization, useOrganizationSlug, useVocabulary } from './components/OrganizationContext';
export {
  NotFoundView,
  type NotFoundViewProps,
  type NotFoundAction,
} from './components/NotFoundView';
export {
  ErrorView,
  type ErrorViewProps,
  type ErrorAction,
} from './components/ErrorView';

export { trackUi, usageOptedOut } from './stats/usage';
export { UsageTracker } from './stats/UsageTracker';
export { UmamiScript, umamiConfig, umamiEnabled } from './stats/UmamiScript';
export { ConsoleBanner, printConsoleBanner } from './console/ConsoleBanner';
export { NotificationSettings, type NotificationSettingsProps } from './components/NotificationSettings';
export { PushDeviceList, type PushDeviceListProps } from './components/PushDeviceList';
export { PasswordSettings, type PasswordSettingsProps } from './components/PasswordSettings';
export { TwoFactorSettings, type TwoFactorSettingsProps } from './components/TwoFactorSettings';
export { ProfileView, PROFILE_TABS, type ProfileTab, type ProfileViewProps } from './components/ProfileView';
