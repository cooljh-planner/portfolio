# ============================================================
#  로컬 미리보기 전용 파일입니다.
#  - GitHub 에 올려서 쓸 때는 GitHub 가 알아서 처리하므로 신경 쓰지 않으셔도 됩니다.
#  - 내 컴퓨터에서 미리보기를 하려면 tools 폴더의 preview-mac.command (맥)
#    또는 preview-windows.bat (윈도우)를 더블클릭하세요.
# ============================================================
source "https://rubygems.org"

gem "github-pages", group: :jekyll_plugins   # GitHub Pages 와 같은 버전의 Jekyll
gem "webrick", "~> 1.8"                      # Ruby 3 이상에서 jekyll serve 에 필요
gem "faraday-retry"                          # 시작할 때 나오는 faraday 경고 방지

# 윈도우에는 시간대 정보(timezone: Asia/Seoul)가 없어서 이 gem 이 필요합니다.
# (맥·리눅스에서는 이 줄이 무시됩니다. 'platforms:' 옵션 대신 if 를 쓴 이유는
#  맥 기본 Bundler 1.x 가 '사용되지 않는 gem' 경고를 띄우기 때문입니다.)
gem "tzinfo-data" if Gem.win_platform?

# 맥에 기본으로 들어 있는 오래된 Ruby(2.6)용 고정 버전.
# 최신 버전은 Ruby 2.7 / 3.x 이상을 요구하므로, 오래된 Ruby 에서만 버전을 묶습니다.
if Gem::Version.new(RUBY_VERSION) < Gem::Version.new("2.7")
  gem "nokogiri", "~> 1.13.10"
  gem "ffi", "~> 1.15.5"
end

# Ruby 3.4 부터는 아래 도구들이 기본 포함에서 빠졌기 때문에 따로 적어 줍니다.
if Gem::Version.new(RUBY_VERSION) >= Gem::Version.new("3.4")
  gem "csv"
  gem "base64"
  gem "bigdecimal"
  gem "logger"
end
