import { StarEmblem } from './svg/StarEmblemIcon';

const policyLinks = ['サイトポリシー', 'プライバシーポリシー', '庁舎案内'];

const serviceLinks = ['ご意見・ご要望', 'サイトマップ'];

export function Footer() {
  return (
    <footer className="bg-primary-50 text-gray-800 dark:bg-gray-900 dark:text-gray-100">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="flex flex-col gap-10 md:flex-row md:gap-12">
          {/* ロゴ */}
          <div className="flex shrink-0 items-center gap-3">
            <StarEmblem className="h-10 w-10 shrink-0" />
            <div className="leading-tight">
              <p className="text-xl font-bold tracking-wide">未来区</p>
              <p className="text-[10px] font-semibold tracking-[0.2em] text-gray-500 dark:text-gray-400">
                MIRAI CITY
              </p>
            </div>
          </div>

          {/* 住所・連絡先 */}
          <address className="not-italic text-sm leading-7 text-gray-700 dark:text-gray-300">
            <p>〒100-0001</p>
            <p>未来県未来区中央1-2-3</p>
            <p>未来シティタワー</p>
            <p className="mt-4">
              電話番号：
              <a
                href="tel:+810312345678"
                className="underline-offset-4 transition-colors hover:text-blue-700 hover:underline dark:hover:text-blue-300"
              >
                (03)1234-5678
              </a>
              （代表）
            </p>
          </address>

          {/* リンク */}
          <nav className="flex gap-12 text-sm md:ml-auto">
            <ul className="space-y-3">
              {policyLinks.map((label) => (
                <li key={label}>
                  <a
                    href="#"
                    className="text-gray-700 underline-offset-4 transition-colors hover:text-blue-700 hover:underline dark:text-gray-300 dark:hover:text-blue-300"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
            <ul className="space-y-3">
              {serviceLinks.map((label) => (
                <li key={label}>
                  <a
                    href="#"
                    className="text-gray-700 underline-offset-4 transition-colors hover:text-blue-700 hover:underline dark:text-gray-300 dark:hover:text-blue-300"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* コピーライト */}
          <div className="text-sm leading-6 text-gray-700 md:self-end md:text-right dark:text-gray-300">
            <p>© Mirai City. All Rights Reserved.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
