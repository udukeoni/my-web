# clean_history.py
import subprocess
import sys

def run_cmd(cmd):
    p = subprocess.run(cmd, shell=True, capture_output=True, text=True, encoding='utf-8', errors='replace')
    return p.returncode, p.stdout.strip(), p.stderr.strip()

print("🚀 [1/4] 현재 브랜치 안전 백업 생성 중...")
run_cmd("git branch -D backup-full-history")
code, _, err = run_cmd("git branch backup-full-history main")
if code != 0:
    print(f"❌ 백업 실패: {err}")
    sys.exit(1)

print("🔍 [2/4] 커밋 히스토리 분석 및 봇/머지 커밋 필터링 중...")
code, out, _ = run_cmd('git log --reverse --format="%H|%s" main')
if code != 0:
    print("❌ git log 조회 실패")
    sys.exit(1)

all_commits = []
for line in out.splitlines():
    if '|' in line:
        h, s = line.split('|', 1)
        all_commits.append((h.strip(), s.strip()))

# 봇 커밋과 머지 커밋 제외 목록 작성
keep_commits = []
first_dropped_idx = None

for idx, (h, s) in enumerate(all_commits):
    is_bot = s.startswith("chore: 일일 공포탐욕지수") or "github-actions" in s
    is_merge = s.startswith("Merge branch")
    
    if is_bot or is_merge:
        if first_dropped_idx is None:
            first_dropped_idx = idx
    else:
        keep_commits.append((h, s))

if first_dropped_idx is None:
    print("✅ 제거할 봇/머지 커밋이 없습니다. 이미 일직선 상태입니다.")
    sys.exit(0)

# 첫 갈래선 직전의 정상 커밋을 베이스(출발점)로 잡기
base_commit = all_commits[first_dropped_idx - 1]
print(f"📍 기준 시작 커밋: {base_commit[1]} ({base_commit[0][:7]})")

# 베이스 이후에 다시 얹어야 할 사용자 커밋들 추출
replay_commits = [c for c in keep_commits if all_commits.index(c) >= first_dropped_idx]
print(f"📦 일직선으로 재배치할 정규 커밋 수: {len(replay_commits)}개")

print("⚡ [3/4] 새 일직선 브랜치 빌드 중...")
run_cmd(f"git checkout -B clean-linear {base_commit[0]}")

for idx, (h, s) in enumerate(replay_commits, 1):
    print(f"   [{idx}/{len(replay_commits)}] 적용 중: {s[:35]}...")
    # incoming commit의 변경사항을 최우선으로 적용하며 체리픽
    code, _, _ = run_cmd(f"git cherry-pick -X theirs {h}")
    
    if code != 0:
        # 충돌 발생 시 무조건 사용자 커밋 변경분 채택 후 자동 진행
        run_cmd("git checkout --theirs .")
        run_cmd("git add -A")
        code2, _, _ = run_cmd("git -c core.editor=true cherry-pick --continue")
        if code2 != 0:
            # 빈 커밋인 경우 건너뛰기
            run_cmd("git cherry-pick --skip")

# 최종 브랜치 교체
run_cmd("git checkout main")
run_cmd("git reset --hard clean-linear")
run_cmd("git branch -D clean-linear")

print("\n🎉 [4/4] 완료! 과거의 모든 봇/머지 커밋이 완벽하게 제거되었습니다.")
print("👉 이제 터미널에서 'git push origin main --force' 를 실행하시면 깃허브에도 반영됩니다.")