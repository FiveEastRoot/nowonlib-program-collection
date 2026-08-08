# 노원구립도서관 문화프로그램 통합 수합 자동화

매월 문화프로그램 자료를 한 번 수합하고 같은 내용으로 HWPX 3종을
생성하기 위한 웹 애플리케이션입니다.

## 현재 구현 범위

- 9개 도서관 마스터와 출력 순서
- 제출자 통합 수합 화면 1개
- 행사 추가·편집·임시저장·제출
- 마감 전 제출완료 자유 수정, 마감 후 관리자 수정 요청, 검토완료 즉시 잠금
- 마감 후 지연 제출 상태
- 관리자 관별 현황·오류·검토 상태
- 관리자 직접 수정과 감사 기록
- 출력 대상 포함·제외와 순서 조정
- 사진은 Google Drive로 별도 수령하고 앱에서는 텍스트 자료만 수합
- 이미지 삽입 영역을 비워 둔 HWPX 생성 정책
- Google Sheets를 운영 데이터 저장소로 사용
- Apps Script Web App을 통한 시트·Drive 연계
- Apps Script 저장·제출·수정요청·잠금·감사로그 API 골격
- 도서관 영문 ID·4자리 PIN 로그인과 역할별 서명 세션
- Netlify Function을 통한 인증·요청 검증·HWPX 생성
- 관리자 버튼 1회로 구청 현황보고·구청 추진계획·재단 월간일정표 3종 생성
- 생성 HWPX의 Google Drive 자동 보관과 버전·감사로그·SHA-256 기록

현재 배포본은 Google Sheets+Apps Script 운영 데이터에 연결되어 있습니다.
도서관 계정은 본인 관의 수합자료만, 관리자 계정은 전체 관의 자료만 읽도록
서버에서 권한을 강제합니다. 2026-07-27 기준 운영 로그인·로그아웃과 역할별
읽기 범위, HWPX 생성·Drive 보관·브라우저 다운로드 체크섬 일치를 검증했습니다.

운영 흐름은 `Netlify 화면 → Netlify Function → Apps Script Web App →
Google Sheets·Google Drive`입니다. 계정 비밀번호와 연계 비밀값은 시트에
평문으로 저장하지 않습니다.

## 개발

```powershell
npm.cmd install
npm.cmd run dev
```

## 검증

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run typecheck:functions
npm.cmd run build
```

## 운영 연결 전 환경변수

`.env.example`은 이름과 형식만 제공하며 실제 값은 포함하지 않습니다.
운영값은 Netlify 환경변수에서만 관리합니다.

- `APPS_SCRIPT_WEB_APP_URL`
- `APPS_SCRIPT_SERVICE_SECRET`
- `SESSION_SIGNING_SECRET`
- `APP_ORIGIN`
- `SUBMITTER_DEFAULT_PIN`
- `ADMIN_PIN`

## 보안

`archive`, `work`, HWP/HWPX 파일, 환경변수와 배포 연결정보는 공개 저장소에서
제외합니다. 실제 운영 템플릿과 수합자료는 비공개 저장소에서 관리해야 합니다.
