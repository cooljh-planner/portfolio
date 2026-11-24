# 장정현 포트폴리오 & 블로그

IT 서비스 기획(전방 밸류체인 DT · 모바일 전자계약 · AI 서비스 · 서비스기획 AX · B2B 에스크로) 프로젝트 아카이브와 실무·조직 운영 기록을 서빙하는 Jekyll 기반 GitHub Pages 정적 사이트입니다.

- **배포 URL**: https://cooljh-planner.github.io/portfolio
- **저장소**: https://github.com/cooljh-planner/portfolio

---

## 주요 기능

- **프로필 및 경력 대시보드 (`index.md`)**: 핵심 지표, 경력 요약, 보유 스킬(프로덕트 및 DT 기획 / AX 및 기술 이해도 / 조직 및 리더쉽), 학력·자격·수상 이력을 front matter 기반으로 구성합니다.
- **카테고리 필터링 & 보기 전환 (`/`, `/archive/`)**: `프로젝트`, `인사이트`, `회고`, `포스트` 카테고리별 조회와 카드형/목록형 보기 전환을 지원합니다.
- **16:9 슬라이드 뷰 & PDF 내보내기 (`/slides/`)**:
  - 각 포스트의 front matter `pdf: true | false`로 슬라이드 PDF 포함 여부를 제어합니다.
  - 상단 `슬라이드 PDF` 메뉴에서 전체 포트폴리오 덱을 확인하고, 글 상세 페이지의 `슬라이드 PDF` 버튼으로 개별 글 PDF를 생성할 수 있습니다.
  - `assets/vendor/`에 포함된 로컬 번들(`html2canvas-pro`, `jspdf`)만 사용하므로 외부 CDN에 의존하지 않으며, 생성된 PDF 안에 웹 포트폴리오·개별 글 URL 링크 어노테이션이 포함됩니다.
- **GitHub Pages 프로젝트 사이트(`/portfolio`) 하위 경로 자동 대응**: 템플릿 내 모든 리소스·페이지 경로에 `relative_url`을 적용하고, 포스트 본문 내 `/assets/`, `/posts/` 경로도 빌드시 자동 보정합니다.

---

## 수록 프로젝트 (10건)

| 분야 | 프로젝트 | 기간 |
| :--- | :--- | :--- |
| 조직관리 | 팀 공통 Jira 프로젝트 관리 체계 신규 수립 | 2026 |
| 영업DT | 영업 커뮤니케이션 DT화 추진 | 2022 – 2026 |
| 영업DT | 온/오프라인 추천판매인 주문 체계 구축 | 2022 – 2026 |
| 영업DT | 영업 퍼널(공유·조회·주문) 설계와 셀프챌린지 구축 | 2023 – 2026 |
| 영업DT | 모바일주문 고도화(사전계약·법인주문 프로세스 구축) | 2022 – 2026 |
| AX | LangGraph 기반 AI 영업비서 및 데이터 파이프라인 구축 | 2025 – 2026 |
| AX | 산출물 현행화 중심의 서비스기획 프로세스 Skill 설계 | 2026 |
| AX | 사내 업무 도구(Apps Script) 및 협업 API 연동 Skill Set 구축 | 2026 |
| 제품관리 | 노무비닷컴 모바일 앱(검토·승인 중심 MVP) 구축 | 2020.01 – 2020.07 |
| 제품관리 | 실시간 지출 데이터 기반 '체불제로인증' 기획 및 운영 | 2018 – 2021 |

---

## 디렉터리 구조

```text
.
├── _config.yml        # Jekyll 사이트 전역 설정 (url/baseurl은 GitHub Pages 자동 주입)
├── index.md           # 메인 프로필, 핵심 지표, 경력/스킬/학력 및 소개글
├── archive.html       # 전체 글 목록 (/archive/)
├── slides.html        # 슬라이드 뷰 및 PDF 생성 데이터 소스 (/slides/)
├── 404.html           # 404 에러 페이지
├── _posts/            # 포트폴리오 프로젝트 및 일반 포스트 마크다운 (10건)
├── _includes/         # 공통 UI 파셜 (head, header, profile, post-browser 등)
├── _layouts/          # 페이지 레이아웃 (default, home, archive, post, slides)
└── assets/
    ├── css/           # main.css, slides.css
    ├── js/            # posts-filter.js, slides.js
    ├── vendor/        # html2canvas-pro.min.js, jspdf.umd.min.js
    └── images/        # 프로필, 파비콘 및 포스트별 이미지 (총 37개)
```

---

## 로컬 미리보기 & 빌드

```bash
# 의존성 설치
bundle install

# 로컬 개발 서버 실행 (http://127.0.0.1:4000)
bundle exec jekyll serve

# 정적 사이트 빌드 (_site/)
bundle exec jekyll build
```

---

## 콘텐츠 작성 & GitHub Pages 배포 가이드

- **새 글 작성**: `_posts/YYYY-MM-DD-slug.md` 형식으로 파일을 추가합니다.
  - 주요 front matter: `title`, `category`, `pdf`, `layout_type` (`image-top` / `image-left` / `image-right` / `gallery` / `text-only`), `period`, `role`, `summary`, `image` / `images`
- **GitHub Pages 배포**:
  - `main` 브랜치에 푸시한 뒤 GitHub 저장소 `Settings → Pages`에서 배포 소스(브랜치 `main` / `/ (root)`)를 설정합니다.
  - [`_config.yml`](_config.yml)의 `url`과 `baseurl`은 로컬 서버(`/`)와 GitHub Pages(`/portfolio`) 양쪽에서 호환되도록 비워 두었으며, PDF 내보내기 시 삽입되는 웹 링크 기준 주소는 [`index.md`](index.md)의 `site_url`에서 관리합니다.
