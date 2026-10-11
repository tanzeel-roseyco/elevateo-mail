package log_maintenance

import (
	"archive/tar"
	"billionmail-core/internal/service/public"
	"compress/gzip"
	"context"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/os/gfile"
)

func CompressAndCleanupLogs(ctx context.Context) {

	baseLogPath := public.AbsPath("../logs")
	operationLogDir := filepath.Join(baseLogPath, "core", "operation_log")

	standardLogDirs := []string{
		filepath.Join(baseLogPath, "core"),
		filepath.Join(baseLogPath, "core", "out"),
	}

	now := time.Now()
	oneDayAgo := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	oneMonthAgo := now.AddDate(0, -1, 0)

	// --- 1. Handle regular logs (core, out) ---
	for _, dir := range standardLogDirs {
		if !gfile.Exists(dir) {
			g.Log().Debugf(ctx, "Regular log directory '%s' does not exist; skipped.", dir)
			continue
		}

		processStandardLogs(ctx, dir, oneDayAgo)
	}
	// --- 2. Special processing operation log (operation_log) ---
	if !gfile.Exists(operationLogDir) {
		g.Log().Debugf(ctx, "Operation log directory '%s' does not exist. Skipping.", operationLogDir)
	} else {
		processOperationLogs(ctx, operationLogDir, oneMonthAgo)
	}

}
func processStandardLogs(ctx context.Context, dir string, oneDayAgo time.Time) {

	allLogFiles, err := gfile.ScanDir(dir, "*.log", false)
	if err != nil {
		g.Log().Errorf(ctx, "Failed to scan log directory %s: %v", dir, err)
		return
	}

	// Group by file name prefix
	logGroups := make(map[string][]string)
	dateLogPattern := regexp.MustCompile(`^\d{4}-\d{2}-\d{2}\.log$`)

	for _, file := range allLogFiles {
		filename := filepath.Base(file)
		if strings.HasPrefix(filename, "access-") {
			logGroups["access"] = append(logGroups["access"], file)
		} else if strings.HasPrefix(filename, "error-") {
			logGroups["error"] = append(logGroups["error"], file)
		} else if dateLogPattern.MatchString(filename) {
			logGroups["date"] = append(logGroups["date"], file)
		}
	}

	// Process each group independently
	for _, files := range logGroups {
		sort.Slice(files, func(i, j int) bool {
			infoI, _ := os.Stat(files[i])
			infoJ, _ := os.Stat(files[j])
			if infoI == nil || infoJ == nil {
				return false
			}
			return infoI.ModTime().Before(infoJ.ModTime())
		})

		// Cleaning and compression logic
		filesToKeep := 30
		// Start traversing from the oldest file
		for i, path := range files {
			// If the file index is less than the number of files to be deleted, then delete them directly.
			if i < len(files)-filesToKeep {
				g.Log().Infof(ctx, "The number of logs has exceeded the limit. Delete the old logs: %s", path)
				os.Remove(path)
				continue
			}

			info, err := os.Stat(path)
			if err != nil {
				continue
			}
			// Only compress files from today and earlier.
			if info.ModTime().Before(oneDayAgo) {

				if err := compressFile(path); err == nil {
					os.Remove(path)
				} else {
					g.Log().Errorf(ctx, "Compression of file %s failed: %v", path, err)
				}
			}
		}
	}
}

// processOperationLogs Handle operation log: Compress the entire date directory from one month ago
func processOperationLogs(ctx context.Context, dir string, oneMonthAgo time.Time) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}

	for _, entry := range entries {
		// Only process the directories, and the directory names should be in the format of YYYY-MM-DD
		if !entry.IsDir() {
			continue
		}
		dirName := entry.Name()
		dirDate, err := time.Parse("2006-01-02", dirName)
		if err != nil {
			continue
		}

		// If the directory date is one month ago, then compress it
		if dirDate.Before(oneMonthAgo) {
			sourceDir := filepath.Join(dir, dirName)
			targetArchive := sourceDir + ".tar.gz"

			if gfile.Exists(targetArchive) {
				continue
			}

			if err := compressDirToTarGz(sourceDir, targetArchive); err == nil {

				if err := os.RemoveAll(sourceDir); err != nil {
					g.Log().Errorf(ctx, "Failed to delete the original operation log directory %s: %v", sourceDir, err)
				}
			} else {
				g.Log().Errorf(ctx, "Compression operation log directory %s failed: %v", sourceDir, err)
			}
		}
	}
}

// compressDirToTarGz Compress the entire directory into a .tar.gz file
func compressDirToTarGz(source, target string) error {
	targetFile, err := os.Create(target)
	if err != nil {
		return err
	}
	defer targetFile.Close()

	gzWriter := gzip.NewWriter(targetFile)
	defer gzWriter.Close()

	tarWriter := tar.NewWriter(gzWriter)
	defer tarWriter.Close()

	return filepath.Walk(source, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		header, err := tar.FileInfoHeader(info, info.Name())
		if err != nil {
			return err
		}

		relPath, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		header.Name = relPath

		if err := tarWriter.WriteHeader(header); err != nil {
			return err
		}

		if !info.IsDir() {
			file, err := os.Open(path)
			if err != nil {
				return err
			}
			defer file.Close()
			_, err = io.Copy(tarWriter, file)
			return err
		}

		return nil
	})
}

// compressFile Compress a single file into the .gz format
func compressFile(sourcePath string) error {
	sourceFile, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destPath := sourcePath + ".gz"
	destFile, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer destFile.Close()

	gzWriter := gzip.NewWriter(destFile)
	defer gzWriter.Close()

	_, err = io.Copy(gzWriter, sourceFile)
	return err
}
