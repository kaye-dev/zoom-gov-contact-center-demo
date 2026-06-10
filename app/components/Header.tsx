import { ThemeToggle } from './ThemeToggle';
import { AlertIcon } from './svg/AlertIcon';
import { SearchMenuIcon } from './svg/SearchMenuIcon';
import { StarEmblem } from './svg/StarEmblemIcon';
import { CrowdIcon } from './svg/CrowdIcon'
import { PinIcon } from './svg/PinIcon';
import { GlobeIcon } from './svg/GlobeIcon';

const navItems = [
  { label: 'アクセス・施設案内', icon: PinIcon },
  { label: '窓口混雑状況', icon: CrowdIcon },
  { label: 'Foreign Language', icon: GlobeIcon },
];

export function Header() {
  return (
    <header className="flex h-20 items-stretch border-b border-gray-200 bg-white text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
      {/* ロゴ */}
      <div className="flex items-center gap-3 pl-6 pr-4">
        <StarEmblem className="h-11 w-11 shrink-0" />
        <div className="leading-tight">
          <p className="text-2xl font-bold tracking-wide">未来区</p>
          <p className="text-[10px] font-semibold tracking-[0.2em] text-gray-500 dark:text-gray-400">
            MIRAI CITY
          </p>
        </div>
      </div>

      {/* ナビゲーション */}
      <nav className="ml-auto flex items-center gap-7 px-6">
        {navItems.map(({ label, icon: Icon }) => (
          <a
            key={label}
            href="#"
            className="flex items-center gap-2 text-sm text-gray-700 transition-colors hover:text-blue-700 dark:text-gray-200 dark:hover:text-blue-300"
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="whitespace-nowrap">{label}</span>
          </a>
        ))}

        {/* ライト/ダークモード切り替えスイッチ */}
        <ThemeToggle />
      </nav>

      {/* 緊急情報 */}
      <a
        href="#"
        className="flex w-24 flex-col items-center justify-center gap-1 bg-sky-100 text-xs font-semibold text-blue-900 transition-colors hover:bg-sky-200 dark:bg-sky-900/40 dark:text-sky-200 dark:hover:bg-sky-900/60"
      >
        <AlertIcon className="h-5 w-5" />
        <span>緊急情報</span>
      </a>

      {/* 検索メニュー */}
      <a
        href="#"
        className="flex w-24 flex-col items-center justify-center gap-1 bg-blue-800 text-xs font-semibold text-white transition-colors hover:bg-blue-900"
      >
        <SearchMenuIcon className="h-5 w-5" />
        <span className="leading-tight text-center">
          検索
          <br />
          メニュー
        </span>
      </a>
    </header>
  );
}
