package at.oxs.paw.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import at.oxs.paw.model.*
import at.oxs.paw.network.ApiService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class AdminViewModel(private val apiService: ApiService) : ViewModel() {
    private val _accounts = MutableStateFlow<List<AdminAccount>>(emptyList())
    val accounts: StateFlow<List<AdminAccount>> = _accounts

    private val _auditLog = MutableStateFlow<List<AuditLogEntry>>(emptyList())
    val auditLog: StateFlow<List<AuditLogEntry>> = _auditLog

    private val _uiState = MutableStateFlow<UiState>(UiState.Idle)
    val uiState: StateFlow<UiState> = _uiState

    fun loadAccounts() {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                val accounts = apiService.getAdminAccounts()
                _accounts.value = accounts
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to load accounts")
            }
        }
    }

    fun loadAuditLog() {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                val log = apiService.getAuditLog()
                _auditLog.value = log
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to load audit log")
            }
        }
    }

    fun updateAccountRole(accountId: String, role: String, verified: Int? = null) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                val request = UpdateRoleRequest(role, verified)
                apiService.updateAccountRole(accountId, request)
                loadAccounts()
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to update role")
            }
        }
    }

    fun verifyAccount(accountId: String, verified: Int) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                val request = VerifyRequest(verified)
                apiService.verifyAccount(accountId, request)
                loadAccounts()
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to verify account")
            }
        }
    }

    fun clearState() {
        _uiState.value = UiState.Idle
    }
}
