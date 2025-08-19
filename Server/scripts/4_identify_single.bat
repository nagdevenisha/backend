@echo off
REM Check for argument
if "%~1"=="" (
    echo Usage: %0 fingerprint_file.fp
    goto END
)
set "fp_file=%~1"

REM Calculate checksum of the fingerprint to be identified
aft_hasher_x64.exe "%fp_file%" -show_checksum > fp_checksum.txt
if %ERRORLEVEL% NEQ 0 GOTO ERREND

REM Extract checksum from the fp_checksum.txt and assign to a variable
for /f "tokens=2 delims=: " %%A in ('findstr /C:"Checksum:" fp_checksum.txt') do set "fp_checksum=%%A"
if %ERRORLEVEL% NEQ 0 GOTO ERREND

REM Request identification license from the AFT Licensing server
set "aft_password=357123457"
wget.exe "http://sonobytes.net/aftservice/aft_eval/aft0.03.08_tied_idents/client_demo.php?method=1&pswrd=%aft_password%&fpchecksum=%fp_checksum%" --retry-connrefused --no-check-certificate --tries=3 -O aft_ident_license.txt
if %ERRORLEVEL% NEQ 0 GOTO ERREND

set /p license=<aft_ident_license.txt

aft_client_x64.exe identify "%fp_file%" -port=12345 -ip=127.0.0.1 -sufficient_hit=0 -search_type=2 -id_stride=1 -search_lb=3 -min_reported_hit=30 -stream -nosplash -license=%license% >> RESULTS.LOG

if %ERRORLEVEL% NEQ 0 GOTO ERREND

GOTO END

:ERREND
echo Error!
pause

:END

