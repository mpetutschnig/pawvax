package at.oxs.paw.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import at.oxs.paw.model.*
import at.oxs.paw.network.ApiService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class OrganizationViewModel(private val apiService: ApiService) : ViewModel() {
    private val _organizations = MutableStateFlow<List<Organization>>(emptyList())
    val organizations: StateFlow<List<Organization>> = _organizations

    private val _selectedOrganization = MutableStateFlow<Organization?>(null)
    val selectedOrganization: StateFlow<Organization?> = _selectedOrganization

    private val _members = MutableStateFlow<List<OrgMember>>(emptyList())
    val members: StateFlow<List<OrgMember>> = _members

    private val _uiState = MutableStateFlow<UiState>(UiState.Idle)
    val uiState: StateFlow<UiState> = _uiState

    fun loadOrganizations() {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                val orgs = apiService.getOrganizations()
                _organizations.value = orgs
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to load organizations")
            }
        }
    }

    fun createOrganization(name: String, type: String = "family") {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                val request = CreateOrgRequest(name, type)
                val org = apiService.createOrganization(request)
                _organizations.value = _organizations.value + org
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to create organization")
            }
        }
    }

    fun loadOrgMembers(orgId: String) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                val members = apiService.getOrgMembers(orgId)
                _members.value = members
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to load members")
            }
        }
    }

    fun inviteToOrg(orgId: String, email: String) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                val request = InviteRequest(email)
                apiService.inviteToOrg(orgId, request)
                loadOrgMembers(orgId)
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to invite member")
            }
        }
    }

    fun acceptOrgInvite(orgId: String) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                apiService.acceptOrgInvite(orgId)
                loadOrganizations()
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to accept invite")
            }
        }
    }

    fun removeOrgMember(orgId: String, memberId: String) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                apiService.removeOrgMember(orgId, memberId)
                loadOrgMembers(orgId)
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to remove member")
            }
        }
    }

    fun selectOrganization(org: Organization) {
        _selectedOrganization.value = org
        loadOrgMembers(org.id)
    }

    fun clearState() {
        _uiState.value = UiState.Idle
    }
}
