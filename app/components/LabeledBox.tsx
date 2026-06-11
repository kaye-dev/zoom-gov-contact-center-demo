import type { ReactNode } from 'react';
import { StarEmblem } from './svg/StarEmblemIcon';

type LabeledBoxProps = {
  /** 上枠線に重ねて表示する区切りラベル */
  label: ReactNode;
  children: ReactNode;
  className?: string;
  /** コンテンツ領域の余白クラス（端まで背景色を広げたい場合などに上書きする） */
  contentClassName?: string;
};

/**
 * 上辺の枠線に見出し（スラッシュ + ラベル）が重なる枠付きボックス。角は直角。
 */
export function LabeledBox({
  label,
  children,
  className,
  contentClassName = 'px-8 pb-8 pt-12',
}: LabeledBoxProps) {
  return (
    <div
      className={`relative border border-gray-300 dark:border-gray-700${
        className ? ` ${className}` : ''
      }`}
    >
      {/* 区切りラベル: 上枠線をまたいで配置（左枠線とで直角コーナーを作る） */}
      <div className="absolute -top-3.5 left-8 right-6 flex items-center">
        {/* スラッシュ + ラベル（背景色で枠線をマスク） */}
        <span className="flex items-center gap-2 bg-background px-3">
          <StarEmblem className="text-gray-700 dark:text-gray-200" />

          <h3 className="whitespace-nowrap text-xl font-bold leading-none">
            {label}
          </h3>
        </span>
      </div>

      {/* コンテンツ領域（余白は contentClassName で制御） */}
      <div className={contentClassName}>{children}</div>
    </div>
  );
}
