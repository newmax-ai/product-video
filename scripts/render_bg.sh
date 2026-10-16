#!/usr/bin/env bash
# 后台分片：render_bg.sh <分片数> <日志根目录> -- <frame_checks.mjs 参数>
# 每次创建独立的报告/日志子目录，避免刚启动时读到上次的通过报告。
# 可加 --wait 等待所有分片退出（用于测试）；默认只启动，不宣称验收完成。
set -euo pipefail
n="${1:?分片数}"; logs="${2:?日志根目录}"; shift 2
[ "${1:-}" != "--" ] || shift
[[ "$n" =~ ^[1-9][0-9]*$ ]] || { printf '分片数必须为正整数\n' >&2; exit 2; }
here="$(cd "$(dirname "$0")" && pwd)"
run_id="$(node -p 'require("node:crypto").randomUUID()')"
report_root=""; out=""; wait_all=0; args=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --report|--out)
      key="$1"; shift
      [ "$#" -gt 0 ] && [[ "$1" != --* ]] || { printf '%s 缺少目录\n' "$key" >&2; exit 2; }
      if [ "$key" = --report ]; then report_root="$1"; else out="$1"; args+=(--out "$1"); fi
      shift ;;
    --run-id|--shard) printf '运行标识和分片由启动器统一设置\n' >&2; exit 2 ;;
    --wait) wait_all=1; shift ;;
    *) args+=("$1"); shift ;;
  esac
done
report_root="${report_root:-${out:-.}/checks}"
report_dir="$report_root/$run_id"; log_dir="$logs/$run_id"
mkdir -p "$report_root" "$logs"
mkdir "$report_dir" "$log_dir"
printf '本次报告目录：%s\n本次日志目录：%s\n' "$report_dir" "$log_dir"
pids=()
for ((k=0; k<n; k++)); do
  nohup node "$here/frame_checks.mjs" "${args[@]}" --report "$report_dir" --run-id "$run_id" --shard "$k/$n" > "$log_dir/shard_$k.log" 2>&1 &
  pids+=("$!")
  printf '分片 %s/%s pid %s\n' "$k" "$n" "$!"
done
printf '尚未验收。使用本次目录汇总，并填入成片完整帧区间：\npython3 %q %q --expect-frames 起:止\n' "$here/check_report.py" "$report_dir"
if [ "$wait_all" -eq 1 ]; then
  result=0
  for pid in "${pids[@]}"; do if wait "$pid"; then :; else code=$?; if [ "$code" -gt "$result" ]; then result="$code"; fi; fi; done
  exit "$result"
fi
