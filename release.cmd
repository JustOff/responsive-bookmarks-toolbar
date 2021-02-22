@echo off
set VER=2.0.2

sed -i -E "s/version>.+?</version>%VER%</" install.rdf
sed -i -E "s/version>.+?</version>%VER%</; s/download\/.+?\/responsive-bookmarks-toolbar-.+?\.xpi/download\/%VER%\/responsive-bookmarks-toolbar-%VER%\.xpi/" update.xml

set XPI=responsive-bookmarks-toolbar-%VER%.xpi
if exist %XPI% del %XPI%
zip -r9q %XPI% * -x .git/* .gitignore update.xml LICENSE README.md *.cmd *.xpi *.exe
