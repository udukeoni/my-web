-- sql/create_users.sql
-- 1. 회원 마스터 테이블 (users)
CREATE TABLE IF NOT EXISTS users (
    user_no INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT UNIQUE NOT NULL,             -- 영문/숫자 아이디 (특수문자 원천 차단)
    password_hash TEXT NOT NULL,              -- SHA-256 단방향 암호화 해시
    nickname TEXT NOT NULL,                   -- 닉네임 (기본: 일개미, 개미_001 등)
    role TEXT DEFAULT 'USER',                 -- 권한: 'ADMIN' | 'USER'
    status TEXT DEFAULT 'ACTIVE',             -- 상태: 'ACTIVE' | 'BLOCKED' | 'RESET_REQUEST'
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 2. 로그인 감사 로그 테이블 (해킹 추적 및 접속 IP 기록용)
CREATE TABLE IF NOT EXISTS login_logs (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    user_agent TEXT,
    login_status TEXT NOT NULL,               -- 'SUCCESS' | 'FAIL'
    attempt_time TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 3. 특수문자 없는 순수 영문+숫자 보안 관리자 계정 등록
-- ID: antmaster84 / PW: sleepingdky98&( / 닉네임: 일개미
INSERT INTO users (user_no, user_id, password_hash, nickname, role, status)
VALUES (
    1,
    'antmaster84',
    'd60ae396e95267a0e36ce5662b1b369527ec5ec598f6e7fe9cbf67a7d57fa4c3',
    '일개미',
    'ADMIN',
    'ACTIVE'
)
ON CONFLICT(user_no) DO UPDATE SET
    user_id = excluded.user_id,
    password_hash = excluded.password_hash,
    nickname = excluded.nickname,
    role = excluded.role;