$logFolder = "C:\AFT\Recording_Audio"
$csvFile = "C:\AFT\match_results.csv"

$results = @()
foreach ($log in Get-ChildItem -Path $logFolder -Filter "*_matching_hires.log") {
    $filename = $log.Name -replace "_matching_hires\.log$",""
    $content = Get-Content $log.FullName

    $startTime = ($content | Select-String "Matching started at:" | ForEach-Object { $_.ToString().Split(':',2)[1].Trim() }) -join ""
    $endLine   = ($content | Select-String "Matching finished at:" | ForEach-Object { $_.ToString() })
    $endTime   = ""
    $duration  = ""
    if ($endLine) {
        $parts = $endLine -split "Matching finished at: | \(duration: | sec\)"
        $endTime = $parts[1].Trim()
        $duration = $parts[2].Trim()
    }
    $resultLine = ($content | Select-String "Matching result:" | Select-Object -First 1)
    $track = ""
    $matchStart = ""
    $matchEnd = ""
    $accuracy = ""
    if ($resultLine) {
        if ($resultLine -match "Track: (.*), Start: ([0-9\.]+), End: ([0-9\.]+), Hit-Factor: ([0-9\.]+)%") {
            $track = $matches[1]
            $matchStart = $matches[2]
            $matchEnd = $matches[3]
            $accuracy = $matches[4]
        }
    }
    $results += [PSCustomObject]@{
        File      = $filename
        Track     = $track
        StartTime = $startTime
        EndTime   = $endTime
        Duration  = $duration
        MatchStart= $matchStart
        MatchEnd  = $matchEnd
        Accuracy  = $accuracy
    }
}
$results | Export-Csv -Path $csvFile -NoTypeInformation -Encoding UTF8
Write-Host "[INFO] Results written to $csvFile"
pause
