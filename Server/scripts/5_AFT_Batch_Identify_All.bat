REM Set your target folder here:
set target_folder=.\Recording_Audio


REM /B = bare format (filename only), /A:-D = exclude directories
for %%F in ("%target_folder%\*.fp") do (
	call 4_identify_single.bat "%%F" 
)

pause