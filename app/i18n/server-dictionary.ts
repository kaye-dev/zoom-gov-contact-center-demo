import { cache } from 'react';

import { getRequestTenant } from '@/lib/server/tenant';

import { buildDictionary } from './build-dictionary';
import { defaultLocale, type Dictionary, type Locale } from './dictionaries';

/**
 * 現在のリクエストのテナントに対応する辞書を返す。
 *
 * サーバー側ではロケールがまだ確定していない（ロケールはlocalStorage管理で
 * クライアント適用）ため、metadata生成は既定ロケールを使う。テナントだけは
 * Hostから確定できるので、サイト名や説明文はテナントに追従する。
 */
export const getRequestDictionary = cache(
  async (locale: Locale = defaultLocale): Promise<Dictionary> => {
    const tenant = await getRequestTenant();
    return buildDictionary(tenant.key, locale);
  },
);
