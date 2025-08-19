@REM Run AFT Server in a separate window
start /SEPARATE cmd /c "aft_server_x64.exe -fp_hires"

@REM Unload Previous FP files from acoustic database
aft_client_x64.exe unload

@REM Add FP files into acoustic database
aft_client_x64.exe add_remote @"C:\AFT\Master_Audio\"