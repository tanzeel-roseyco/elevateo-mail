use std::{io, mem::{size_of, zeroed}, os::windows::ffi::OsStrExt, path::Path, ptr::{null, null_mut}, thread, time::{Duration, Instant}};
use windows_sys::Win32::{Foundation::{CloseHandle, HANDLE, WAIT_OBJECT_0}, System::{JobObjects::*, Threading::*}};

// AIDEV-NOTE: This is process/resource containment, not a filesystem/network sandbox or CLI adapter.
struct Handle(HANDLE);
impl Drop for Handle {
    fn drop(&mut self) { unsafe { CloseHandle(self.0); } }
}
pub enum FixtureMode { Exit, Hang, Descendant, Echo, Flood, InvalidUtf8, HeldOutput }
pub struct FixtureJob { job: Handle, process: Handle }
fn checked(ok: i32) -> io::Result<()> {
    if ok == 0 { Err(io::Error::last_os_error()) } else { Ok(()) }
}
impl FixtureJob {
    pub fn start(executable: &Path, mode: FixtureMode) -> io::Result<Self> {
        Self::start_with_handles(executable, mode, None)
    }
    pub(super) fn start_with_handles(executable: &Path, mode: FixtureMode, handles: Option<[HANDLE; 3]>) -> io::Result<Self> {
        let executable = executable.canonicalize()?;
        if executable.file_name().and_then(|v| v.to_str()) != Some("bridge-fixture.exe") {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "Expected fixture executable"));
        }
        let path: Vec<u16> = executable.as_os_str().encode_wide().collect();
        if path.iter().any(|v| *v == 0 || *v == 34) || path.len() > 30_000 {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "Invalid fixture path"));
        }
        let mut application = path.clone(); application.push(0);
        let mode = match mode { FixtureMode::Exit => "exit", FixtureMode::Hang => "hang", FixtureMode::Descendant => "descendant",
            FixtureMode::Echo => "echo", FixtureMode::Flood => "flood", FixtureMode::InvalidUtf8 => "invalid-utf8", FixtureMode::HeldOutput => "held-output" };
        let mut command = vec![34]; command.extend(path); command.extend(format!("\" {mode}\0").encode_utf16());
        let environment = [0u16, 0];
        unsafe {
            let job = Handle(CreateJobObjectW(null(), null()));
            if job.0.is_null() { return Err(io::Error::last_os_error()); }
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                | JOB_OBJECT_LIMIT_ACTIVE_PROCESS | JOB_OBJECT_LIMIT_JOB_MEMORY;
            limits.BasicLimitInformation.ActiveProcessLimit = 4;
            limits.JobMemoryLimit = 128 * 1024 * 1024;
            checked(SetInformationJobObject(job.0, JobObjectExtendedLimitInformation,
                &limits as *const _ as *const _, size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32))?;
            let mut cpu: JOBOBJECT_CPU_RATE_CONTROL_INFORMATION = zeroed();
            cpu.ControlFlags = JOB_OBJECT_CPU_RATE_CONTROL_ENABLE | JOB_OBJECT_CPU_RATE_CONTROL_HARD_CAP;
            cpu.Anonymous.CpuRate = 1000;
            checked(SetInformationJobObject(job.0, JobObjectCpuRateControlInformation,
                &cpu as *const _ as *const _, size_of::<JOBOBJECT_CPU_RATE_CONTROL_INFORMATION>() as u32))?;
            let mut startup: STARTUPINFOEXW = zeroed(); startup.StartupInfo.cb = size_of::<STARTUPINFOW>() as u32;
            let mut attributes = Vec::<usize>::new();
            if let Some(ref handles) = handles {
                let mut bytes = 0;
                InitializeProcThreadAttributeList(null_mut(), 1, 0, &mut bytes);
                attributes.resize(bytes.div_ceil(size_of::<usize>()), 0);
                startup.lpAttributeList = attributes.as_mut_ptr() as _;
                checked(InitializeProcThreadAttributeList(startup.lpAttributeList, 1, 0, &mut bytes))?;
                if let Err(error) = checked(UpdateProcThreadAttribute(startup.lpAttributeList, 0,
                    PROC_THREAD_ATTRIBUTE_HANDLE_LIST as usize, handles.as_ptr() as _, size_of::<[HANDLE; 3]>(), null_mut(), null())) {
                    DeleteProcThreadAttributeList(startup.lpAttributeList); return Err(error);
                }
                startup.StartupInfo.cb = size_of::<STARTUPINFOEXW>() as u32;
                startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
                startup.StartupInfo.hStdInput = handles[0]; startup.StartupInfo.hStdOutput = handles[1]; startup.StartupInfo.hStdError = handles[2];
            }
            let mut process: PROCESS_INFORMATION = zeroed();
            // AIDEV-NOTE: Exact I/O handle allowlist, empty environment; suspend before job assignment prevents escape races.
            let created = CreateProcessW(application.as_ptr(), command.as_mut_ptr(), null(), null(), handles.is_some() as i32,
                CREATE_SUSPENDED | CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT | if handles.is_some() { EXTENDED_STARTUPINFO_PRESENT } else { 0 },
                environment.as_ptr() as *const _, null(), &startup.StartupInfo, &mut process);
            let create_result = checked(created);
            if !startup.lpAttributeList.is_null() { DeleteProcThreadAttributeList(startup.lpAttributeList); }
            create_result?;
            let process_handle = Handle(process.hProcess);
            let primary_thread = Handle(process.hThread);
            if let Err(error) = checked(AssignProcessToJobObject(job.0, process_handle.0)) {
                // Suspended and not assigned: explicitly terminate before dropping its only process handle.
                checked(TerminateProcess(process_handle.0, 1))?;
                if WaitForSingleObject(process_handle.0, 5000) != WAIT_OBJECT_0 {
                    return Err(io::Error::new(io::ErrorKind::TimedOut, "Unassigned child cleanup unconfirmed"));
                }
                return Err(error);
            }
            let result = Self { job, process: process_handle };
            if ResumeThread(primary_thread.0) == u32::MAX { return Err(io::Error::last_os_error()); }
            Ok(result)
        }
    }
    pub fn active_processes(&self) -> io::Result<u32> {
        let mut info: JOBOBJECT_BASIC_ACCOUNTING_INFORMATION = unsafe { zeroed() };
        unsafe { checked(QueryInformationJobObject(self.job.0, JobObjectBasicAccountingInformation,
            &mut info as *mut _ as *mut _, size_of::<JOBOBJECT_BASIC_ACCOUNTING_INFORMATION>() as u32, null_mut()))?; }
        Ok(info.ActiveProcesses)
    }
    pub fn root_exited(&self) -> bool { unsafe { WaitForSingleObject(self.process.0, 0) == WAIT_OBJECT_0 } }
    pub(super) fn exit_code(&self) -> io::Result<u32> {
        let mut code = 0;
        unsafe { checked(GetExitCodeProcess(self.process.0, &mut code))?; }
        Ok(code)
    }
    pub fn stop(&self) -> io::Result<()> {
        unsafe { checked(TerminateJobObject(self.job.0, 1))?; }
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if self.active_processes()? == 0 { return Ok(()); }
            if Instant::now() >= deadline { return Err(io::Error::new(io::ErrorKind::TimedOut, "Tree cleanup unconfirmed")); }
            thread::sleep(Duration::from_millis(10));
        }
    }
}
