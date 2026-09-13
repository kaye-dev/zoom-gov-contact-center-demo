# CLIと形式の拡張

Python 3.10以降、標準ライブラリのみ。`scripts/flow.py`をこのスキルの実際の配置先から呼ぶ。以下の `$SKILL` はスキルディレクトリ、入出力パスは作業対象へ置き換える。全コマンドで入力を明示し、inspect以外は新しい出力ディレクトリを指定する。既存ディレクトリは上書きしない。

```sh
python3 "$SKILL/scripts/flow.py" inspect --input /absolute/path/export.json
python3 "$SKILL/scripts/flow.py" build --input /absolute/path/export.json --out /absolute/path/result
python3 "$SKILL/scripts/flow.py" build --input /absolute/path/export.json --separation terminals --out /absolute/path/terminal-result
python3 "$SKILL/scripts/flow.py" build --input /absolute/path/export.json --separation selected --target SM_Prelude --target RT_End --out /absolute/path/selected-result
python3 "$SKILL/scripts/flow.py" build --input /absolute/path/export.json --separation all --out /absolute/path/separated-result
python3 "$SKILL/scripts/flow.py" build --input /absolute/path/export.json --horizontal-gap 100 --vertical-gap 40 --out /absolute/path/compact-result
```

- `inspect`: 形式・問題・合流分離時の参照リスク・循環・終了経路数を標準出力へ返す。未知チャネルを音声と判定しない。
- `build`: specなしでは配置／分離、spec付きで新規／変更。標準`reuse`。全分離は非循環の到達可能グラフを展開し、循環成分は一組だけ保持する。
- `validate`: 既存JSONを変更せずローカル検証。比較元と証跡を指定すれば同等性も再検証する。
- `preview`: 座標を変更せずSVGと検証結果を生成する。重なりがあれば失敗を報告する。

成功終了は0、問題／未対応で2。仮値を含むテストデータは構造検証に成功しても`delivery_ready=false`である。必ず結果本文を読む。ブロックされた入力から完成品を捏造しない。入力の構造問題を修復する場合は明示的なedit仕様を作る。

```sh
python3 "$SKILL/scripts/flow.py" validate --input /absolute/path/result/flow.json --source /absolute/path/export.json --kind layout --out /absolute/path/recheck
python3 "$SKILL/scripts/flow.py" validate --input /absolute/path/separated-result/flow.json --source /absolute/path/export.json --kind split --proof /absolute/path/separated-result/verification.json --out /absolute/path/split-recheck
python3 "$SKILL/scripts/flow.py" preview --input /absolute/path/result/flow.json --out /absolute/path/preview
```

新規／edit後の`source_sha256`は配置・分離直前の論理フローを指す。元の入力との差分は`input_sha256`と`spec_sha256`で識別する。元のエクスポートと新規フローを同等として比較しない。新規／edit成果物の再検証は`--requirements`で期待動作を照合する。

## 論理仕様

Codexが要望を確認済みテンプレートのノードへ対応付ける。`--input`に部品となる実エクスポート、`--spec`に以下の形式を渡す。同梱の合成fixtureはテストだけに使用する。

```json
{
  "mode": "new",
  "nodes": [
    {"name": "Start", "template": "Start", "targets": ["SM_Notice"]},
    {"name": "SM_Notice", "template": "SM_Notice", "targets": ["RT_End", "RT_End"],
     "set": [{"pointer": "/properties/audioList/0/message", "value": "受付を終了します。"}]},
    {"name": "RT_End", "template": "RT_End", "targets": []}
  ],
  "envelope_set": [{"pointer": "/flowName", "value": "終了案内"}],
  "verification": {
    "requirements": [
      {"id": "R1", "statement": "終了案内を再生し、正常時も再生失敗時も切断する",
       "widgets": ["SM_Notice", "RT_End"], "scenarios": ["normal", "media-failure"]}
    ],
    "scenarios": [
      {"id": "normal", "steps": [
        {"widget": "Start", "exit": 0},
        {"widget": "SM_Notice", "exit": 0,
         "assert": [{"pointer": "/properties/audioList/0/message", "equals": "受付を終了します。"}]}
       ], "expected_end": "RT_End", "terminal": true,
       "end_assert": [{"pointer": "/properties/routeTo", "equals": "Disconnect"}]},
      {"id": "media-failure", "steps": [
        {"widget": "Start", "exit": 0}, {"widget": "SM_Notice", "exit": 1}
       ], "expected_end": "RT_End", "terminal": true}
    ]
  }
}
```

templateは入力内のノード名。targetsはテンプレートの出口順と一対一で指定する。setは既存パスの値だけを置き換える。未知キー追加や未知の出口構造は、対応チャネルの部品／プロファイルを取得してから行う。分岐数が変わる場合は、その数のメニューを含む確認済み部品を用意するか、確認した出口形式を使った遷移配列を明示的にsetし、全IDと条件を検証する。

新規作成前に入力の外側メタデータと開始ノードの設定を確認する。イベント処理、変数、エントリポイント、既存環境への参照を意図せず継承しない。入力は目的に合う最小のひな形を選び、不要な処理を持つ実業務フローを無検討で転用しない。

```sh
python3 "$SKILL/scripts/flow.py" build --input /absolute/path/templates.json --spec /absolute/path/new-spec.json --out /absolute/path/new-result
```

既存変更のspecは `mode=edit`、`edits=[{"widget":"SM_Notice","pointer":"/properties/audioList/0/message","value":"新しい案内"}]` とする。verificationは同形式で必須。外側の名称・説明はenvelope_setを使用できる。IDや名前の変更は汎用パッチではなく、参照関係を確認した明示的な移行として扱う。

`--requirements /path/requirements.json`でも上記verificationオブジェクトを渡せる。specのverificationと両方ある場合はこの明示ファイルを使う。出口は0始まり。終端まで確認するシナリオはterminal=trueを必ず指定する。循環のテストは有限のstepsで具体的な再試行を再現する。CLIは外部APIや音声を実行しない。

## チャネル別プロファイル

`--profile /path/profile.json`で、出典付きで確認した別プロファイルを指定できる。`voice-export-profile.json`の形を参照し、実エクスポートの根拠に沿って作る。

必要な項目は、name、channel、source、checked_on、envelope_match、types、owned_id_paths、external_id_paths、dimensions。Messagingではmessaging_subchannelも必須。channelの値はこのCLI内の分類で、Zoom JSONの数値を表すものではない。

- `envelope_match`: 当該エクスポートから確認した識別値の完全一致条件。異なるチャネル／サブチャネルを一つのプロファイルへ曖昧に登録しない。
- `types`: 対応する型と必須パス、exit_counts（イベントごとの最小・最大数）。型内の動作差はvariant_pointerとvariantsで区別する。判明していないイベントは許容しない。
- `owned_id_paths`: コピー自身が所有するIDの明示JSON pointer。配列部分のみ`*`を使える。外部IDをここに追加して参照検査を通してはいけない。
- `external_id_paths`: 当該環境のキュー、アセット、フロー等のIDパス。値を維持する。変数を指すIDはさらにスコープをレビューする。
- `dimensions`: ウィジェットごとのwidth/header/exit_height/input_y。`dimensions_basis`に観測方法を記載する。
- `verified_max_nodes`: 実際の上限を確認できた場合だけ出典付きで追加する。CLIのローカル予算と小さい方を使用する。

現行アダプターは外側JSONの文字列widgetsJson → state配列、各ノードのname/id/type/top/left/properties/transitions、遷移のnextによる名前参照を扱う。別の構造ならプロファイルの値だけを変えて対応したことにせず、decode/encodeと検証を対応形式へ拡張して実エクスポートの回帰テストを追加する。外側と未知フィールドはそのまま保持する。

出典・確認日・対応チャネル・型／変種・未確認事項を資料に残す。アカウントIDや実メッセージを同梱fixtureへコピーしない。形式の確認、ローカル処理の検証、実際の取り込み確認は別の状態として管理する。
