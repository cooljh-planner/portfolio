---
title: "AX - 사내 업무 도구(Apps Script) 및 협업 API 연동 Skill Set 구축"
summary: "팀장으로서 사내 Google Workspace 환경의 조직도 관리 웹앱·HTML 문서 뷰어 구축을 총괄하고, Jira·Confluence·Google Workspace API 연동 Skill Set과 표준 실행 환경을 팀에 정식 보급"
layout_type: gallery
image: /assets/images/coway-ax-tools/01-clasp-workspace-tools.png
images:
  - src: /assets/images/coway-ax-tools/01-clasp-workspace-tools.png
    alt: "로컬 AI와 clasp CLI로 Google Apps Script 사내 웹앱을 빌드·배포하고 권한을 연계하는 흐름을 도식화한 구조도"
    caption: "clasp 기반 Google Workspace 사내 웹앱 빌드·배포 구조 (구조도)"
  - src: /assets/images/coway-ax-tools/02-viewer-trust-isolation-structure.png
    alt: "Drive HTML 문서 뷰어의 신뢰 셀과 격리 문서 창 분리, 서버·Drive·개인 저장소 연결과 문서 열람 흐름을 도식화한 구조도"
    caption: "Drive HTML 문서 뷰어 신뢰·격리 구조 (구조도)"
  - src: /assets/images/coway-ax-tools/03-orgchart-forest.png
    alt: "조직도 관리 웹앱에서 계층형 조직 카드, 상하 연결, 편성안 비교 및 버전 관리 툴바를 보여 주는 실제 UI 화면"
    caption: "조직도 관리 웹앱 계층 편집 화면 (실제 UI)"
  - src: /assets/images/coway-ax-tools/04-ddv-prototype-home.png
    alt: "Drive HTML 문서 뷰어 홈에서 문서 열기 입력, 최근 본 문서·즐겨찾기, 폴더 사이드바를 보여 주는 실제 UI 화면"
    caption: "Drive HTML 문서 뷰어 홈 화면 (실제 UI)"
tags: [코웨이, AX, AppsScript, SkillSet]
category: "프로젝트"
pdf: true
period: "2026"
role: "팀장 : 100%"
---

## 개요

"사내 업무 도구부터 협업 API 연동 Skill Set까지 구축·보급 총괄"

팀장으로서 Google Workspace 기반 협업 환경에서 정식 IT 과제로 배정되기 어려운 실무 공백을 해소하기 위해, AI와 `clasp` 기반 Apps Script 사내 웹앱의 기획·구축과 배포를 총괄한 프로젝트입니다. 아울러 팀 기획·검증 과정에서 AI가 사내 협업 도구를 직접 조회·수정할 수 있도록 Jira·Confluence·Google Workspace API 연동 Skill Set과 표준 실행 환경 구축·보급을 이끌었습니다.

## 문제 정의

"협업 환경의 기능 공백과 도구 연동의 파편화"

첫째, 협업 인력과 조직 개편안을 검토할 때마다 스프레드시트와 별도 조직도 자료의 버전 일치·누락을 수작업으로 맞춰야 했습니다. 둘째, 대용량 HTML 분석 리포트와 산출물이 늘었지만 구글 드라이브 기본 뷰어가 렌더링을 지원하지 않아 공유 동선이 끊겼습니다. 셋째, 기획자마다 AI로 Jira·Confluence·Google Workspace를 다루는 방식과 인증 절차가 달라 공통 실행 기반이 부재했습니다.

## 해결 방향

"팀장 주도의 사내 웹앱 및 협업 API 연동 Skill Set 구축·보급"

별도 서버나 방화벽 절차 없이 Google Workspace 권한 체계 위에서 동작하는 Apps Script 웹앱과 함수형 API 연동 Skill Set의 아키텍처·보안 기준을 수립하고, 로컬 AI 워크플로우 기반 구축과 팀 정식 보급을 총괄하였습니다.

### 1. clasp 기반 조직도 관리 웹앱 및 HTML 문서 뷰어 구축

로컬 AI와 `clasp` CLI로 프론트엔드와 Apps Script(`.gs`)를 빌드·배포하는 표준 파이프라인을 수립하고 주요 업무 도구를 정식 배포하였습니다. **조직도 관리 웹앱**은 Google Sheets와 연동해 계층형 조직도와 편성안을 웹에서 직접 편집·비교하며 병합 저장과 권한 분리, 감사 로그를 제공해 타 실에도 정식 보급·운영하였습니다. **HTML 문서 뷰어**는 본인 권한의 Drive HTML 문서를 격리 영역에서 안전하게 즉시 열람하도록 구현해 대규모 자동화 테스트를 통과하며 정식 운영 안정성을 확보했습니다.

### 2. Jira·Confluence·Google Workspace API 연동 Skill Set 개발

산출물 현행화가 수작업 복사·붙여넣기에 머물지 않도록 **Jira**(이슈 조회·생성·전환·워크로그·스프린트), **Confluence**(페이지 조회·트리 탐색·생성·수정·첨부), **Google Workspace**(Gmail·Drive·Calendar·Apps Script 관리) 연동 기능을 서버리스 함수 라이브러리(Skill Set)로 설계·구축하고, 삭제 같은 파괴적 작업에는 가드레일을 적용했습니다. Atlassian 연동으로 시작해 Google Workspace와 Apps Script 배포 기능까지 단계적으로 범위를 넓혔습니다.

### 3. 기획자용 표준 실행 환경 패키징 및 팀 보급

개발 환경에 익숙하지 않은 팀원도 즉시 쓸 수 있도록 안내 문서, 설치 스크립트, 버전 파일, Google 브라우저 인증 마법사와 사전 점검 도구를 공통 패키지로 묶어 팀 표준 실행 환경으로 정식 보급·운영하였습니다. 이후 웹 검증 QA Skill도 동일 규격에 통합했고, 팀에서 제작한 Jira 연동 배포노트 자동 작성 Apps Script 도구 등은 사내 AX 기획 도구 허브를 통해 실서비스로 공유·운영되고 있습니다.

## 회고 포인트

팀장으로서 기존 Google Workspace 인프라에 `clasp`와 표준 API 연동 계층을 결합하는 방향을 정립하자 기획 조직이 기다리지 않고 필요한 도구를 직접 만들어 공급할 수 있었습니다. 단순 스크립트를 넘어 보안·권한 격리와 공통 설치 규격까지 함께 설계한 점이 팀 단위 확장과 정식 운영의 기반이 되었습니다.
